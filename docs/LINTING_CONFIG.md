# Linting and Formatting Configuration

## .zen Files Ignored

`.zen` files are currently ignored by both ESLint and Prettier until proper language support is added in Phase 3+.

## Configuration Files

### `.eslintignore`
- Contains `**/*.zen` to exclude all `.zen` files from ESLint checking
- Includes standard ignores (node_modules, dist, etc.)

### `.prettierignore`
- Contains `**/*.zen` to exclude all `.zen` files from Prettier formatting
- Includes standard ignores (node_modules, dist, etc.)

## Usage

### Formatting
```bash
# Format TypeScript files only (ignores .zen files)
bun run format

# Check formatting for TypeScript files only
bun run format:check
```

### ESLint
If ESLint is configured, `.zen` files will be automatically ignored via `.eslintignore`.

## Notes

- When explicitly passing `**/*.zen` to Prettier, it may still check the files
- The ignore files work when checking all files or using broader patterns
- `.zen` files use custom syntax (`state` keyword) that standard linters don't understand
- This is a temporary solution until proper language support is added

## Future

In Phase 3+, proper language support for `.zen` files will be added, and these ignore rules can be removed.


