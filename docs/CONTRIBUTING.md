# 💫 Contributing to Zenith
## 📌 Prerequisites

> Before you begin, join the [Discord Server](https://discord.gg/T85bBj8T3n) and **ensure you have the following installed**:

- **[Bun](https://bun.sh/)** (v1.0 or later) - Zenith uses Bun as its JavaScript runtime and package manager
- **[Git](https://git-scm.com/)** - For version control

### Installation

1. **Clone the repository (no fork)**
   ```ts
   git clone https://github.com/judahbsullivan/zenith.js.git
   cd zenith
   ```
2. **Install dependencies**
   ```ts
   bun install
   ```
3. **Run the development server**
   ```ts
   bun dev
   ```
## 🌿 Branching Strategy
### Option 1: Issue-Driven Development (Preferred)

1. **Create or find an issue** on GitHub that describes the work you want to do
2. **Create a branch from the issue** directly on GitHub
   - Branch name format: `{issue-number}-{short-description}`
   - Example: `33-contributing-md`
3. **Pull the branch** to your local machine
   ```ts
   git fetch origin
   git checkout 33-contributing-md
   ```

### Option 2: Feature/Fix Branch

If you're working on something without an existing issue:

1. **Branch from `main`**
   ```ts
   git checkout main
   git pull origin main
   git checkout -b {prefix}/{short-description}
   ```
2. **Use appropriate prefix subfolder** based on the type of change:
   - `feat/` for new features → MINOR version bump (0.n.0)
   - `fix/` for bug fixes → PATCH version bump (0.0.n)
   - `docs/` for documentation changes
   - `refactor/` for code refactoring
   - `test/` for adding or updating tests
   - `chore/` for maintenance tasks

Example: `feat/reactive-state` or `fix/router-navigation`

## 📝 Commit Strategy
> Zenith follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for consistent versioning and changelog generation.

### Commit Message Format

```ts
<type>[optional scope]: <description>
[optional body]
[optional footer(s)]
```
### Quick Reference

| Prefix   | SemVer Impact | Example                          |
|----------|---------------|----------------------------------|
| `fix:`   | PATCH (0.0.n) | `fix: html not recognizing state` |
| `feat:`  | MINOR (0.n.0) | `feat: add reactive state system` |
| `feat!:` | MAJOR (n.0.0) | `feat!: change compiler API`      |
| `fix!:`  | MAJOR (n.0.0) | `fix!: remove deprecated methods` |

**Breaking Changes**: Use `!` after the type or include `BREAKING CHANGE:` in the footer.

**📌 For complete details, see [COMMITS.md](COMMITS.md)**

## 💬 Pull Request Comment Strategy
> Zenith uses [Conventional Comments](https://conventionalcomments.org/) for clear, actionable PR feedback.

### Comment Format
```ts
<label> [decorations]: <subject>
[discussion]
```
### Examples
```ts
suggestion (non-blocking): Consider using a more descriptive variable name
This would improve readability for future maintainers.
```
```ts
issue (blocking): This function will throw an error when input is null
We need to add null checking before processing.
```

**📌 For complete details, see [COMMENTS.md](COMMENTS.md)**

## ❓ Questions?
- Check existing [Issues](https://github.com/judahbsullivan/zenith/issues)
- Review [README.md](../README.md) for project overview
- Reach out to maintainers in your PR, Issue or [Discord!](https://discord.gg/T85bBj8T3n)

---

**Remember**: Contributing should be enjoyable! Don't hesitate to ask questions if anything is unclear.

