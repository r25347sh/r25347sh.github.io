# r25347sh.github.io

Personal site protected by **sitePassword** — a lightweight client-side auth gate.

## Files

| File | Role |
|------|------|
| `sitePassword.js` | Auth logic, allows DSL parser, session persistence |
| `sitePassword.yml` | User credentials (ID = SHA-256, PASS = SHA-512) + roles |
| `sitePassword.css` | Login UI styles |

## Usage

```html
<script src="/sitePassword.js" defer
        data-allows="((role:admin%teacher)%ID:special)&role:beekeeper">
</script>
```

### Operators

- `%` = OR
- `&` = AND
- `!!` = NOT
- `()` = grouping

Atoms: `role:xxx` or `ID:xxx` (bare identifier is treated as role).

### Initial users

| ID | Password | Role |
|----|----------|------|
| `admin` | `Supercalifragilisticexpialidocious` | admin |
| `4A` | `dokusaiseiji` | bika |

After successful login the user is asked whether to save the session in the browser.
