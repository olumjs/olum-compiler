<p align="center"><img width="100" src="https://github.com/olumjs.png" alt="Olum logo"></p>
<p align="center">
 <a href="https://www.npmjs.com/package/olum-compiler" target="_blank"><img src="https://img.shields.io/npm/v/olum-compiler" alt="npm"></a>
 <img src="https://img.shields.io/npm/dm/olum-compiler" alt="npm">
 <img src="https://img.shields.io/npm/l/olum-compiler" alt="npm">
</p>

# Olum-Compiler
See [Documentation](https://olumjs.top/docs)

## Contributing
Thanks for wanting to help make Olum-Compiler better! 💙 Bug fixes, new features, and docs improvements are all welcome.

### The branch rule (important)
Olum-Compiler uses **one branch per version** (`v2.1.0`, `v2.1.1`, ...). Each new version branch is created from the previous one, so the **latest version branch always contains everything**.

> ✅ Always base your work on the **latest** version branch (currently **`v2.1.3`**).
> ❌ Never base it on an older one like `v2.1.0` — your PR will be missing recent changes and will conflict.

Not sure which one is the latest? Check the branch list on GitHub (or run `git branch -r`) and pick the highest version number.

### Step by step
1. **Fork** the repo and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/olum-compiler.git
   cd olum-compiler
   ```
2. **Check out the latest version branch** (replace `v2.1.3` with the newest one):
   ```bash
   git fetch origin
   git checkout v2.1.3
   ```
3. **Create your own branch from it** — a copy of the latest version with your changes on top:
   ```bash
   git checkout -b feat/my-awesome-feature
   # or: git checkout -b fix/describe-the-bug
   ```
4. **Install dependencies:**
   ```bash
   npm install
   ```
5. **Make your change.** Source lives in `lib/` and the CLI entry in `bin/`. Keep the change focused: one feature or fix per PR.
6. **Run the tests** and add or update them in `tests/` when behavior changes:
   ```bash
   npm test
   ```
7. **Update the docs** if your change affects user-facing behavior (see below).
8. **Commit** using a clear message, following the existing style:
   ```
   feat: support alias in import statements
   fix: hmr goes into infinite loop if multiple apps running at the same time
   ```
9. **Push** your branch to your fork:
   ```bash
   git push origin feat/my-awesome-feature
   ```
10. **Open a Pull Request** against the **latest version branch** (e.g. `v2.1.3`) — *not* an older version. Describe what changed, why, and include a small example if it's user-facing.

### Docs are part of the change
User-facing documentation lives on [olumjs.top/docs](https://olumjs.top/docs). If your PR changes behavior or adds a feature, mention in the PR description what the docs need so they can be updated alongside it. No docs change needed? Just say so (e.g. internal refactor).

### PR checklist
- [ ] Branched from the **latest** version branch (not an older one)
- [ ] PR targets the latest version branch
- [ ] `npm test` passes
- [ ] Docs impact noted in the PR description
- [ ] One focused change, clear commit messages

Questions or unsure about an idea? Ask in [Discord](https://discord.gg/2zK7tb2Cg9) before you start — we're happy to help.

## Community
- [X](https://x.com/olumjs)
- [Bluesky](https://bsky.app/profile/olumjs.bsky.social)
- [Discord](https://discord.gg/2zK7tb2Cg9)

## Contact
- General: [hello@olumjs.top](mailto:hello@olumjs.top)
- Security: [security@olumjs.top](mailto:security@olumjs.top) — please report vulnerabilities here privately rather than opening a public issue
