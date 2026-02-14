# Contributing to Relay Chat

## Development Workflow

We use a pull request (PR) based development flow to ensure code quality and stability.

### Step-by-Step Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make your changes**
   - Write your code
   - Add/update tests as needed
   - Ensure code follows project conventions

3. **Test locally**
   ```bash
   # Build and type check
   npm run build
   npm run type-check
   
   # Run e2e tests
   cd tests/e2e
   npm run test
   ```

4. **Push your branch**
   ```bash
   git add .
   git commit -m "Description of your changes"
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request**
   - Go to the repository on Forgejo (forge.brakke.cc/erik/relay-chat)
   - Click "New Pull Request"
   - Select your branch and target `master` or `main`
   - Fill out the PR description with:
     - What changed
     - Why it changed
     - Any testing notes

6. **CI/CD Pipeline Runs**
   
   When you open a PR, the CI pipeline will automatically:
   - ✅ Build API and Frontend
   - ✅ Run type checks
   - ✅ Run Playwright E2E tests in **two viewports**:
     - **Desktop** (1280x720 - Chromium)
     - **Mobile** (390x844 - iPhone 12 emulation)
   - 📦 Upload test artifacts (screenshots, traces) if tests fail
   - 🚫 **Does NOT deploy** (deploy only happens on push to master)

7. **CI must pass**
   - All builds must succeed
   - Desktop E2E tests must pass
   - Mobile E2E tests must pass
   - Fix any failing tests before merging

8. **Code Review**
   - Wait for review from a maintainer
   - Address any feedback
   - Push additional commits if needed (CI will re-run)

9. **Merge to main**
   - Once approved and CI is green, merge the PR
   - Delete your feature branch

10. **Auto-deploy**
    - On merge to `master`/`main`, the deploy job automatically:
      - Deploys to Fly.io
      - Verifies deployment
      - Updates production at https://chat.brakke.cc

## Branch Protection

- Direct pushes to `master`/`main` should be avoided
- All changes should go through PRs
- CI must pass before merging
- Consider enabling branch protection rules in your repository settings

## Testing Requirements

### Desktop Testing
- Default Chromium browser
- Viewport: 1280x720
- Tests full desktop layout and functionality

### Mobile Testing
- Chromium with iPhone 12 emulation
- Viewport: 390x844
- Tests responsive design and mobile interactions

### Debugging Failed Tests
When tests fail, the CI pipeline uploads:
- `playwright-screenshots-{desktop|mobile}` - Screenshots at failure points
- `playwright-traces-{desktop|mobile}` - Playwright traces for debugging
- `playwright-report-{desktop|mobile}` - HTML test reports
- `playwright-test-results-{desktop|mobile}` - Raw test results

Download these artifacts from the CI run to investigate failures locally.

## Questions?

If you have questions about the contribution process, open an issue or reach out to the maintainers.
