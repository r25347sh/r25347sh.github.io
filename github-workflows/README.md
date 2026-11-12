# Workflow templates

Current classic token does **not** have the `workflow` scope, so these files cannot be placed under `.github/workflows/` via API.

## How to enable

1. Copy the files:
   ```
   github-workflows/pages.yml    →  .github/workflows/pages.yml
   github-workflows/validate.yml →  .github/workflows/validate.yml
   ```

2. (Recommended) Create a new classic PAT with scopes:
   - `repo`
   - `workflow`
   - `delete_repo` (if still needed)

3. In repository Settings → Pages:
   - Source: **GitHub Actions**

After that, every push to `main` will deploy with concurrency control (previous runs are cancelled → faster & no race).
