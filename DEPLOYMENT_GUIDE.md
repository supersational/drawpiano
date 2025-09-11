# Deployment Guide

Complete guide for publishing and deploying the drawpiano library.

## Pre-Publishing Checklist

1. **Update package.json**

   ```bash
   # Update version
   npm version patch|minor|major

   # Verify package details
   npm run build
   npm run size
   ```

2. **Test builds locally**

   ```bash
   npm run build
   ls -la dist/

   # Test UMD build
   open test-umd.html

   # Test dev server
   npm run dev
   ```

3. **Update documentation**
   - README.md examples work
   - USAGE.md is current
   - CHANGELOG.md updated

## NPM Publishing

### First-time Setup

```bash
# Login to npm
npm login

# Verify you're logged in
npm whoami

# Check package name availability
npm view drawpiano
```

### Publishing Process

```bash
# Clean build
npm run clean
npm run build

# Verify package contents
npm pack --dry-run

# Test installation locally
cd /tmp
npm init -y
npm install /path/to/drawpiano-lib/drawpiano-1.0.0.tgz
node -e "console.log(require('drawpiano'))"

# Publish to npm
npm publish

# For pre-release versions
npm publish --tag beta
```

### Post-publish Verification

```bash
# Check it's live
npm view drawpiano

# Test CDN links work
curl -I https://unpkg.com/drawpiano/dist/umd/drawpiano.min.js
curl -I https://cdn.jsdelivr.net/npm/drawpiano/dist/umd/drawpiano.min.js
```

## Version Management

### Semantic Versioning

- **Patch** (1.0.1): Bug fixes, no breaking changes
- **Minor** (1.1.0): New features, backwards compatible
- **Major** (2.0.0): Breaking changes

```bash
# Automatic version bump
npm version patch   # 1.0.0 → 1.0.1
npm version minor   # 1.0.0 → 1.1.0
npm version major   # 1.0.0 → 2.0.0

# Manual version in package.json
# Then: npm publish
```

### Pre-release Versions

```bash
npm version prerelease --preid=beta  # 1.0.0 → 1.0.1-beta.0
npm publish --tag beta

# Install pre-release
npm install drawpiano@beta
```

## CDN Distribution

Your package automatically works on CDNs after npm publish:

### UNPKG

- Latest: `https://unpkg.com/drawpiano/dist/umd/drawpiano.min.js`
- Specific: `https://unpkg.com/drawpiano@1.0.0/dist/umd/drawpiano.min.js`
- Browse: `https://unpkg.com/browse/drawpiano/`

### jsDelivr

- Latest: `https://cdn.jsdelivr.net/npm/drawpiano/dist/umd/drawpiano.min.js`
- Specific: `https://cdn.jsdelivr.net/npm/drawpiano@1.0.0/dist/umd/drawpiano.min.js`

## GitHub Integration

### Releases

```bash
# Create git tag for releases
git tag v1.0.0
git push origin v1.0.0

# Or use GitHub UI to create release
# Attach dist/ files as assets
```

### GitHub Actions (Optional)

Create `.github/workflows/publish.yml`:

```yaml
name: Publish Package
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Development Workflow

### Local Development

```bash
# Link for local testing
npm link
cd /path/to/test-project
npm link drawpiano

# Start dev server
npm run dev

# Watch mode builds
npm run build -- --watch
```

### Testing in Other Projects

```bash
# Pack without publishing
npm pack
# Creates drawpiano-1.0.0.tgz

# Test in another project
cd /path/to/test-project
npm install /path/to/drawpiano-1.0.0.tgz
```

## Monitoring & Analytics

### NPM Stats

- View downloads: https://npmcharts.com/compare/drawpiano
- Package info: https://www.npmjs.com/package/drawpiano
- Bundle analysis: https://bundlephobia.com/package/drawpiano

### GitHub Stats

- Releases page: Track downloads of release assets
- Insights: View traffic, clones, popular content

## Maintenance

### Regular Updates

```bash
# Update dependencies
npm update
npm audit fix

# Rebuild and test
npm run build
npm run dev
```

### Security

```bash
# Check for vulnerabilities
npm audit

# Fix automatically where possible
npm audit fix
```

### Cleanup

```bash
# Remove old versions (if needed)
npm unpublish drawpiano@1.0.0

# Deprecate versions
npm deprecate drawpiano@1.0.0 "Please upgrade to 1.0.1"
```

## Troubleshooting

### Common Issues

**Build fails:**

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Publish fails:**

```bash
# Check you're logged in
npm whoami

# Check package name isn't taken
npm view drawpiano

# Try with --dry-run first
npm publish --dry-run
```

**CDN not updating:**

- Wait 5-10 minutes for propagation
- Try different CDN (unpkg vs jsdelivr)
- Check version number is correct

## Quick Commands Reference

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build all formats
npm run size         # Check build size

# Publishing
npm version patch    # Bump version
npm publish          # Publish to npm
npm pack             # Test package locally

# Testing
npm link             # Link for local testing
npm pack --dry-run   # Preview package contents
```
