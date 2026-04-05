Here’s a refined, layout-and-content-only description for a developer.

## Overview

This is a **year planner / roadmap interface** built around a **large central detail panel** with the **months arranged around the perimeter** of the screen.

The outer structure acts like a frame around the main content area. The center contains the detailed planning view, while the surrounding cards represent months and quarter markers.

The main idea is:

* **center = active planning/detail area**
* **outer ring = year navigation / summary by month**
* **corners = quarter markers**

---

## Layout structure

The screen is organized into three main regions:

### 1. Top row

Contains five cards across:

* Q1
* January
* February
* March
* Q2

### 2. Middle row

Contains three zones:

* left vertical stack of months
* large center planner panel
* right vertical stack of months

Left stack:

* December
* November
* October

Right stack:

* April
* May
* June

### 3. Bottom row

Contains five cards across:

* Q4
* September
* August
* July
* Q3

So the months progress around the outside of the interface rather than in a traditional calendar grid.

---

## ASCII layout

```text
+-----------+-----------+-----------+-----------+-----------+
|    Q1     |    JAN    |    FEB    |    MAR    |    Q2     |
|           |           |           |           |           |
+-----------+-----------+-----------+-----------+-----------+
|    DEC    |                                           |APR|
|           |                                           |   |
+-----------+                                           +---+
|    NOV    |           PROGRESS PLANNER                |MAY|
|           |                                           |   |
+-----------+                                           +---+
|    OCT    |                                           |JUN|
|           |                                           |   |
+-----------+-----------+-----------+-----------+-----------+
|    Q4     |    SEP    |    AUG    |    JUL    |    Q3     |
|           |           |           |           |           |
+-----------+-----------+-----------+-----------+-----------+
```

---

## Content structure by region

## Outer perimeter cards

The outer cards contain summary information for each month or quarter.

### Quarter cards

There are four quarter cards:

* Q1 in the top-left
* Q2 in the top-right
* Q3 in the bottom-right
* Q4 in the bottom-left

These function as anchor blocks for the yearly layout. In the screenshot they mostly appear as structural markers rather than dense content areas.

### Top month cards

The top row month cards are:

* January
* February
* March

These contain short lists of initiatives, milestones, or themes for each month.

Examples visible:

* January contains several roadmap items
* February contains a small amount of content
* March contains multiple items and appears to be the currently active month

### Left-side month cards

The left column contains:

* December
* November
* October

These appear more like milestone/phase cards than detailed note cards.

Examples visible:

* “Acqui-hire Phase 3”
* “Acqui-hire Phase 2”
* “Acqui-hire Phase 1”

### Right-side month cards

The right column contains:

* April
* May
* June

These contain longer forward-looking milestone text, such as business goals, launch states, or operational targets.

### Bottom month cards

The bottom row contains:

* September
* August
* July

These contain short outcome-style statements, likely representing target states for those months.

---

## Central panel

The center of the interface is a large panel labeled:

**PROGRESS PLANNER**

This is the main detail area of the interface.

### Center panel header

The panel header contains:

* the title: **PROGRESS PLANNER**
* a segmented time-view control with:

  * YEAR
  * MONTH
  * WEEK
  * TODAY

In the screenshot, **YEAR** appears to be active.

### Center panel body

Below the header is a vertically scrollable list of planning items.

This list appears to show detailed objectives or progress entries associated with the selected timeframe, likely tied to the selected month and/or current view mode.

---

## Structure of items inside the center panel

The center panel contains a stack of horizontal entries.

Each entry has:

* a category or area label
* a corresponding descriptive statement or goal

Examples of visible category labels include:

* V47
* ITERATOR
* COMMERCIAL ARTS
* FAMILY/TRIBE
* ART/LIGHT/MUSIC

These read like strategic buckets, life domains, projects, or business areas.

Examples of content patterns:

* revenue/business goals
* product/business milestones
* educational or curriculum milestones
* family/personal priorities
* creative practice goals

So the center panel is essentially a **detailed annual planning list grouped by category/domain**.

---

## Selected-state behavior implied by the layout

The layout suggests that one perimeter month can be active at a time.

In the screenshot, March appears to be selected, and the center panel likely reflects the active planning context for that selection.

This suggests an interaction model like:

* click a month card on the perimeter
* update the central planner content
* optionally switch view mode with YEAR / MONTH / WEEK / TODAY

---

## Developer-facing interpretation

A developer should think of this as a **frame-based yearly planner layout**, not a standard calendar.

Core structure:

* a perimeter of month/quarter cards
* a large central detail panel
* month cards used as summary/navigation elements
* central panel used for detailed records and scrollable planning items

---

## Component-level breakdown

A clean component model would be:

* `YearPlannerPage`

  * `YearLabel`
  * `TopRow`

    * `QuarterCard(Q1)`
    * `MonthCard(JAN)`
    * `MonthCard(FEB)`
    * `MonthCard(MAR)`
    * `QuarterCard(Q2)`
  * `MiddleRow`

    * `LeftMonthStack`

      * `MonthCard(DEC)`
      * `MonthCard(NOV)`
      * `MonthCard(OCT)`
    * `ProgressPlannerPanel`

      * `PlannerHeader`
      * `TimeViewToggle`
      * `ScrollableGoalList`
    * `RightMonthStack`

      * `MonthCard(APR)`
      * `MonthCard(MAY)`
      * `MonthCard(JUN)`
  * `BottomRow`

    * `QuarterCard(Q4)`
    * `MonthCard(SEP)`
    * `MonthCard(AUG)`
    * `MonthCard(JUL)`
    * `QuarterCard(Q3)`

