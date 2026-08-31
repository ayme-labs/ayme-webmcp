---
status: accepted
---

# Capture only the top-level document

The initial StructuralTree covers the top-level document only. An iframe element may appear, but its child document and cross-frame POM roots do not. This avoids treating frame-local refs as one namespace before frame composition rules exist.
