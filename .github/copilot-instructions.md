### No-Question Rule for Routine Dev Errors (MANDATORY)

For common local development failures (e.g. EADDRINUSE, missing build artifacts,
stale processes, cache issues):

- DO NOT ask the user for preferences
- DO NOT offer options
- Automatically apply the safest, least-invasive fix
- Proceed with execution and report the outcome

Examples of auto-resolvable issues:
- Port already in use (EADDRINUSE)
- Stale dev server processes
- Missing node_modules
- Cache/build artifacts
- Local test failures due to environment drift

Only ask the user if:
- The action is destructive
- The action affects production or shared environments
- The action requires secrets or credentials
