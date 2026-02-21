#!/usr/bin/env bash
# dev-cycle.sh - Autonomous feature development orchestrator
# Takes a feature from scoped description through implementation to completion
# Usage: ./dev-cycle.sh <feature-folder> [--ralph-max <n>] [--ralph-extra <text>] [--stop-on-manual-test] [--skip-docs]

set -uo pipefail
# Note: not using set -e — we handle errors explicitly to avoid silent exits.

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <feature-folder> [OPTIONS]"
  echo "  feature-folder:            Path to the feature directory (e.g. _dev-tasks/_planning/2026-02-17_feature-cycle-automation/)"
  echo ""
  echo "Options:"
  echo "  --ralph-max <n>           Maximum ralph iterations (default: 30)"
  echo "  --ralph-extra <text>      Additional instructions for ralph (optional, quote the string)"
  echo "  --stop-on-manual-test     Stop when NEEDS_HUMAN_TEST is emitted (default: off)"
  echo "  --skip-docs               Skip documentation update phase (default: off)"
  echo "  --dry-run                 Show what would happen without executing (default: off)"
  exit 1
fi

FEATURE_FOLDER="$1"
shift

# Remove trailing slash if present
FEATURE_FOLDER="${FEATURE_FOLDER%/}"

# Default options
RALPH_MAX_ITERATIONS="30"
RALPH_EXTRA_INSTRUCTIONS=""
STOP_ON_MANUAL_TEST=0
SKIP_DOCS=0
DRY_RUN=0

# Parse optional arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --ralph-max)
      if [ $# -lt 2 ]; then
        echo "Error: --ralph-max requires a value"
        exit 1
      fi
      RALPH_MAX_ITERATIONS="$2"
      shift 2
      ;;
    --ralph-extra)
      if [ $# -lt 2 ]; then
        echo "Error: --ralph-extra requires a value"
        exit 1
      fi
      RALPH_EXTRA_INSTRUCTIONS="$2"
      shift 2
      ;;
    --stop-on-manual-test)
      STOP_ON_MANUAL_TEST=1
      shift
      ;;
    --skip-docs)
      SKIP_DOCS=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "Error: Unknown argument: $1"
      echo "Run '$0' without arguments to see usage."
      exit 1
      ;;
  esac
done

# Validate feature folder exists
if [ ! -d "$FEATURE_FOLDER" ]; then
  echo "Error: Feature folder not found: $FEATURE_FOLDER"
  exit 1
fi

# Validate that the folder contains at least one *_feature-description.md file
FEATURE_DESCRIPTION=$(find "$FEATURE_FOLDER" -maxdepth 1 -name '*_feature-description.md' | head -1)
if [ -z "$FEATURE_DESCRIPTION" ]; then
  echo "Error: No feature description file (*_feature-description.md) found in: $FEATURE_FOLDER"
  exit 1
fi

# Extract the feature folder basename for log messages
FEATURE_BASENAME=$(basename "$FEATURE_FOLDER")

# Print configuration summary
echo "=== Dev Cycle Configuration ==="
echo "Feature folder: $FEATURE_FOLDER"
echo "Feature: $FEATURE_BASENAME"
echo "Feature description: $FEATURE_DESCRIPTION"
echo "Ralph max iterations: $RALPH_MAX_ITERATIONS"
if [ -n "$RALPH_EXTRA_INSTRUCTIONS" ]; then
  echo "Ralph extra instructions: $RALPH_EXTRA_INSTRUCTIONS"
fi
if [ "$STOP_ON_MANUAL_TEST" -eq 1 ]; then
  echo "Stop on manual test: enabled"
fi
if [ "$SKIP_DOCS" -eq 1 ]; then
  echo "Skip documentation: enabled"
fi
if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run: enabled (no changes will be made)"
fi
echo "==================================="
echo ""

# ============================================================================
# Helper Functions (shared with ralph.sh)
# ============================================================================

# Temporary file for capturing claude output
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

# Run claude and stream output in real-time.
# Captures raw stream-json to tmpfile while displaying assistant text live.
run_claude_streaming() {
  local tmpfile="$1"
  shift
  > "$tmpfile"

  # Run claude with streaming. --verbose is required for stream-json.
  claude "$@" --output-format stream-json --verbose \
    | tee "$tmpfile" \
    | jq --unbuffered -r 'select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text' 2>/dev/null \
    || true

  # Debug: if tmpfile is empty, claude probably failed
  if [ ! -s "$tmpfile" ]; then
    echo "[dev-cycle] Warning: No output from claude. Retrying with json format for diagnostics..."
    claude "$@" --output-format json 2>&1 | tee "$tmpfile" || true
  fi
}

# Extract session_id from stream-json (or json) output
get_session_id() {
  # Try stream-json format first (multiple lines, each a JSON object)
  local sid
  sid=$(jq -r 'select(.session_id != null) | .session_id' "$1" 2>/dev/null | tail -1) || true
  # Fall back to single json object format
  if [ -z "$sid" ] || [ "$sid" = "null" ]; then
    sid=$(jq -r '.session_id // empty' "$1" 2>/dev/null) || true
  fi
  echo "${sid:-}"
}

# Extract final result text from stream-json (or json) output
get_result_text() {
  local txt
  # Try stream-json format (look for result event)
  txt=$(jq -r 'select(.type == "result") | .result' "$1" 2>/dev/null | tail -1) || true
  # Fall back to single json object format
  if [ -z "$txt" ]; then
    txt=$(jq -r '.result // empty' "$1" 2>/dev/null) || true
  fi
  echo "${txt:-}"
}

# ============================================================================
# Feature-Specific Helper Functions
# ============================================================================

# Extract the status folder name from the feature folder path
# e.g., "_dev-tasks/_planning/2026-02-17_foo/" -> "_planning"
get_status_folder() {
  local folder="$1"
  # Remove trailing slash
  folder="${folder%/}"
  # Get the parent directory basename
  local parent=$(dirname "$folder")
  basename "$parent"
}

# Check if the implementation guide has unchecked tasks
# Returns 0 if unchecked tasks exist, 1 if all tasks are checked
has_unchecked_tasks() {
  local guide_file="$1"
  if [ ! -f "$guide_file" ]; then
    return 1
  fi
  # Count unchecked checkboxes: "- [ ]"
  # Use -- to separate options from pattern, then pipe to wc -l
  local unchecked_count=$(grep -- '- \[ \]' "$guide_file" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$unchecked_count" -gt 0 ]; then
    return 0  # Has unchecked tasks
  else
    return 1  # No unchecked tasks
  fi
}

# Detect the current phase based on feature folder state
# Returns one of: generate-guide, move-to-in-progress, ralph, update-docs, move-to-complete, done
detect_phase() {
  local folder="$1"

  # Find the implementation guide if it exists
  local guide_file=$(find "$folder" -maxdepth 1 -name '*_implementation-guide.md' | head -1)

  # Get the status folder (e.g., "_planning", "_in-progress", "_complete")
  local status=$(get_status_folder "$folder")

  # Phase detection logic
  if [ -z "$guide_file" ]; then
    # No guide exists -> generate it
    echo "generate-guide"
    return
  fi

  # Guide exists - check location and task status
  case "$status" in
    _planning|_ready-to-start)
      # Guide exists but folder hasn't moved to in-progress yet
      echo "move-to-in-progress"
      ;;
    _in-progress)
      # In progress - check if there are unchecked tasks
      if has_unchecked_tasks "$guide_file"; then
        echo "ralph"
      else
        # All tasks checked - move to docs or complete
        if [ "$SKIP_DOCS" -eq 1 ]; then
          echo "move-to-complete"
        else
          echo "update-docs"
        fi
      fi
      ;;
    _complete)
      # Already complete
      echo "done"
      ;;
    *)
      # Unknown status folder
      echo "Error: Unknown status folder: $status" >&2
      exit 1
      ;;
  esac
}

# ============================================================================
# Phase Execution Functions
# ============================================================================

# Phase A: Generate implementation guide using the implementation-guide skill
run_generate_guide() {
  echo ""
  echo "=== Phase: Generate Implementation Guide ==="
  echo ""

  # Validate skill files exist
  local skill_file=".claude/skills/implementation-guide/SKILL.md"
  local format_file=".claude/skills/implementation-guide/references/implementation-guide-format.md"

  if [ ! -f "$skill_file" ]; then
    echo "Error: Implementation guide skill not found: $skill_file"
    exit 1
  fi

  if [ ! -f "$format_file" ]; then
    echo "Error: Implementation guide format reference not found: $format_file"
    exit 1
  fi

  # Read skill instructions and format reference
  local skill_content=$(cat "$skill_file")
  local format_content=$(cat "$format_file")

  # Find the feature description file
  local feature_desc=$(find "$FEATURE_FOLDER" -maxdepth 1 -name '*_feature-description.md' | head -1)

  # Construct the prompt
  local prompt="You are implementing the implementation-guide skill.

$skill_content

---

Format reference:

$format_content

---

Please create an implementation guide for the feature described in:
$feature_desc

Follow the process outlined in the skill instructions:
1. Read and understand the feature description
2. Research the codebase to understand architecture and conventions
3. Build the implementation guide following the format reference
4. Output the guide as YYYY-MM-DD_implementation-guide.md in the same directory as the feature description

Use the tools available to you: Read, Write, Glob, Grep, Task, WebSearch, WebFetch"

  # Call claude with the prompt
  echo "[dev-cycle] Calling claude to generate implementation guide..."
  echo ""

  run_claude_streaming "$TMPFILE" -p "$prompt" \
    --allowedTools "Read,Write,Glob,Grep,Task,WebSearch,WebFetch"

  # Extract session info (for debugging)
  local session_id=$(get_session_id "$TMPFILE")
  if [ -n "$session_id" ]; then
    echo ""
    echo "[dev-cycle] Session ID: $session_id"
  fi

  # Verify the guide was created
  local guide_file=$(find "$FEATURE_FOLDER" -maxdepth 1 -name '*_implementation-guide.md' | head -1)
  if [ -z "$guide_file" ]; then
    echo ""
    echo "Error: Implementation guide was not created after claude call."
    echo "Expected a file matching pattern: $FEATURE_FOLDER/*_implementation-guide.md"
    exit 1
  fi

  echo ""
  echo "[dev-cycle] Implementation guide created: $guide_file"

  # Commit the guide
  echo "[dev-cycle] Committing implementation guide..."
  git add "$FEATURE_FOLDER/" && git commit -m "feat: generate implementation guide for $FEATURE_BASENAME"

  echo ""
  echo "=== Phase Complete: Generate Implementation Guide ==="
  echo ""
}

# ============================================================================
# Phase B & E: Move Feature Folder
# ============================================================================

# Moves a feature folder to a new status directory
# Args:
#   $1 - source_folder: current path to the feature folder
#   $2 - target_status: target status folder name (e.g., "_in-progress", "_complete")
# Side effects:
#   - Updates the global FEATURE_FOLDER variable to the new path
#   - Creates a git commit for the move
move_feature_folder() {
  local source_folder="$1"
  local target_status="$2"

  # Compute target path
  local folder_basename=$(basename "$source_folder")
  local target_path="_dev-tasks/${target_status}/${folder_basename}"

  echo ""
  echo "=== Phase: Move to ${target_status} ==="
  echo ""
  echo "[dev-cycle] Moving $folder_basename to $target_status..."

  # Check if target already exists (edge case)
  if [ -d "$target_path" ]; then
    echo "[dev-cycle] Warning: Target folder already exists at $target_path"
    echo "[dev-cycle] Skipping move (folder is already in the correct location)."
    FEATURE_FOLDER="$target_path"
    return 0
  fi

  # Ensure target status directory exists
  mkdir -p "_dev-tasks/${target_status}"

  # Move the folder
  mv "$source_folder" "$target_path"

  if [ $? -ne 0 ]; then
    echo "Error: Failed to move folder from $source_folder to $target_path"
    exit 1
  fi

  echo "[dev-cycle] Moved to: $target_path"

  # Update the global FEATURE_FOLDER variable
  FEATURE_FOLDER="$target_path"

  # Commit the move
  echo "[dev-cycle] Committing folder move..."
  git add -A && git commit -m "chore: move $FEATURE_BASENAME to $target_status"

  echo ""
  echo "=== Phase Complete: Move to ${target_status} ==="
  echo ""
}

# ============================================================================
# Phase C: Ralph Loop Delegation
# ============================================================================

# Delegates implementation to ralph.sh for iterative development
# Side effects:
#   - Calls ralph.sh as a subprocess
#   - Exits with appropriate code based on ralph's result
run_ralph_loop() {
  echo ""
  echo "=== Phase: Ralph Implementation Loop ==="
  echo ""

  # Find the implementation guide
  local guide_file=$(find "$FEATURE_FOLDER" -maxdepth 1 -name '*_implementation-guide.md' | head -1)
  if [ -z "$guide_file" ]; then
    echo "Error: No implementation guide found in $FEATURE_FOLDER"
    exit 1
  fi

  echo "[dev-cycle] Implementation guide: $guide_file"
  echo "[dev-cycle] Delegating to ralph.sh..."
  echo ""

  # Build ralph.sh arguments
  local ralph_args=("$guide_file" "$RALPH_MAX_ITERATIONS")

  if [ -n "$RALPH_EXTRA_INSTRUCTIONS" ]; then
    ralph_args+=("$RALPH_EXTRA_INSTRUCTIONS")
  fi

  if [ "$STOP_ON_MANUAL_TEST" -eq 1 ]; then
    ralph_args+=("--stop-on-manual-test")
  fi

  # Call ralph.sh as a subprocess (inherits stdout/stderr for streaming)
  ./ralph.sh "${ralph_args[@]}"
  local ralph_exit=$?

  echo ""
  echo "[dev-cycle] Ralph exit code: $ralph_exit"

  # Handle ralph exit codes:
  # 0 = COMPLETE
  # 1 = Max iterations reached
  # 2 = HALT (unresolvable error)
  # 3 = NEEDS_HUMAN_TEST (with --stop-on-manual-test)
  case "$ralph_exit" in
    0)
      echo "[dev-cycle] Ralph completed successfully (COMPLETE marker detected)."
      echo ""
      echo "=== Phase Complete: Ralph Implementation Loop ==="
      echo ""
      return 0
      ;;
    1)
      echo ""
      echo "=== Ralph reached max iterations ($RALPH_MAX_ITERATIONS) without completion. ==="
      echo "The implementation may be incomplete. Review the guide and either:"
      echo "  - Increase --ralph-max and re-run"
      echo "  - Manually complete remaining tasks"
      echo "  - Investigate if there's a blocker"
      exit 1
      ;;
    2)
      echo ""
      echo "=== Ralph encountered an unresolvable error (HALT). ==="
      echo "Review the output above to identify the issue."
      exit 2
      ;;
    3)
      echo ""
      echo "=== Ralph stopped for manual testing (NEEDS_HUMAN_TEST). ==="
      echo "Complete the manual testing, then re-run dev-cycle.sh to continue."
      exit 3
      ;;
    *)
      echo ""
      echo "=== Ralph exited with unexpected code: $ralph_exit ==="
      exit 1
      ;;
  esac
}

# ============================================================================
# Phase D: Documentation Update
# ============================================================================

# Updates repository documentation to reflect the newly implemented feature
# Side effects:
#   - Calls claude -p with read/write tools to update docs
#   - Skipped entirely when --skip-docs flag is set
run_update_docs() {
  # Check if documentation update should be skipped
  if [ "$SKIP_DOCS" -eq 1 ]; then
    echo ""
    echo "=== Phase: Update Documentation (SKIPPED) ==="
    echo ""
    echo "[dev-cycle] Skipping documentation update (--skip-docs flag set)"
    echo ""
    echo "=== Phase Complete: Update Documentation ==="
    echo ""
    return 0
  fi

  echo ""
  echo "=== Phase: Update Documentation ==="
  echo ""

  # Find the implementation guide to understand what was built
  local guide_file=$(find "$FEATURE_FOLDER" -maxdepth 1 -name '*_implementation-guide.md' | head -1)
  local guide_ref=""
  if [ -n "$guide_file" ]; then
    guide_ref="The implementation guide is located at: $guide_file"
  fi

  # Construct the prompt for documentation update
  local prompt="You are tasked with updating repository documentation to reflect a newly completed feature.

## Context

A feature has just been implemented and all implementation tasks are complete. Your job is to:
1. Review recent changes to understand what was built
2. Scan existing documentation to identify what needs updating
3. Update any stale or incomplete documentation
4. Commit your changes

## Recent Changes

Run \`git log --oneline -30\` to see what was recently committed.
${guide_ref}

## Documentation Locations

Common documentation files in this repository:
- README.md — project overview, setup, usage, commands
- AGENTS.md — project mission, development workflow, architectural notes
- docs/ folder — detailed guides and specifications
- __meta-dev/ folder — meta-documentation about the development process

Scan the repository for any \`.md\` files that may need updating based on the changes.

## Your Task

1. Read the recent git log to understand what changed
2. Read the implementation guide (if present) to understand the feature scope
3. Use Glob to find relevant documentation files
4. Read existing documentation files
5. Identify any documentation that is now stale or missing coverage of the new feature
6. Update the documentation files as needed
7. Commit your changes with a descriptive message (e.g., \"docs: update for <feature-name>\")

## Important Notes

- This is a best-effort task. If all documentation is already up-to-date, that's fine — just report that no updates were needed.
- Focus on user-facing documentation (README, guides) and architectural notes (AGENTS.md, design docs).
- Do not create new documentation files unless truly necessary.
- Use the Edit tool to update existing files rather than rewriting them.
- Be concise — update only what needs updating.
- If you make changes, commit them at the end.

Use the tools available to you: Read, Write, Edit, Glob, Grep, Bash"

  # Call claude with the prompt
  echo "[dev-cycle] Calling claude to update documentation..."
  echo ""

  run_claude_streaming "$TMPFILE" -p "$prompt" \
    --allowedTools "Read,Write,Edit,Glob,Grep,Bash"

  # Extract session info (for debugging)
  local session_id=$(get_session_id "$TMPFILE")
  if [ -n "$session_id" ]; then
    echo ""
    echo "[dev-cycle] Session ID: $session_id"
  fi

  # Note: We don't validate doc changes were made — this phase is best-effort
  # Claude should handle committing if changes were made

  echo ""
  echo "[dev-cycle] Documentation update phase complete."
  echo ""
  echo "=== Phase Complete: Update Documentation ==="
  echo ""
}

# ============================================================================
# Main Execution Loop
# ============================================================================

# Track start time for elapsed time reporting
START_TIME=$(date +%s)

# Safety counter to prevent infinite loops (max 10 phase transitions)
MAX_PHASE_TRANSITIONS=10
phase_counter=0

# Initial phase detection
CURRENT_PHASE=$(detect_phase "$FEATURE_FOLDER")

echo "Starting phase: $CURRENT_PHASE"
echo ""

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[DRY RUN] Would execute phase: $CURRENT_PHASE"
  exit 0
fi

# Main execution loop - continues through all phases until completion
while true; do
  # Increment phase counter and check safety limit
  phase_counter=$((phase_counter + 1))
  if [ "$phase_counter" -gt "$MAX_PHASE_TRANSITIONS" ]; then
    echo ""
    echo "=== ERROR: Maximum phase transitions exceeded ($MAX_PHASE_TRANSITIONS) ==="
    echo "This likely indicates an infinite loop. Current phase: $CURRENT_PHASE"
    echo "Please investigate the phase detection logic or feature folder state."
    exit 1
  fi

  # Detect current phase
  CURRENT_PHASE=$(detect_phase "$FEATURE_FOLDER")

  # Log phase transition
  echo ""
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║  Phase $phase_counter: $(printf '%-54s' "$CURRENT_PHASE") ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""

  # Execute the appropriate phase
  case "$CURRENT_PHASE" in
    generate-guide)
      run_generate_guide
      continue
      ;;
    move-to-in-progress)
      move_feature_folder "$FEATURE_FOLDER" "_in-progress"
      continue
      ;;
    ralph)
      run_ralph_loop
      continue
      ;;
    update-docs)
      run_update_docs
      continue
      ;;
    move-to-complete)
      move_feature_folder "$FEATURE_FOLDER" "_complete"
      continue
      ;;
    done)
      # Calculate elapsed time
      END_TIME=$(date +%s)
      ELAPSED=$((END_TIME - START_TIME))
      ELAPSED_MIN=$((ELAPSED / 60))
      ELAPSED_SEC=$((ELAPSED % 60))

      echo ""
      echo "╔════════════════════════════════════════════════════════════════╗"
      echo "║                      DEV CYCLE COMPLETE!                       ║"
      echo "╚════════════════════════════════════════════════════════════════╝"
      echo ""
      echo "Feature: $FEATURE_BASENAME"
      echo "Total phases executed: $phase_counter"
      echo "Total elapsed time: ${ELAPSED_MIN}m ${ELAPSED_SEC}s"
      echo ""
      echo "The feature has been moved to _complete and is ready for use."
      exit 0
      ;;
    *)
      echo ""
      echo "=== ERROR: Unknown phase: $CURRENT_PHASE ==="
      echo "This indicates a bug in the phase detection logic."
      exit 1
      ;;
  esac
done
