# Advanced Topics

## Pulling in upstream updates

Your repo is independent from the template — there's no automatic link. If you want to pull in improvements from the starter kit later:

```bash
git remote add upstream https://github.com/tylerdurrett/oneshot.git
git fetch upstream
git merge upstream/main --allow-unrelated-histories
```

Resolve any conflicts and keep what makes sense for your project.
