# MH Wilds Hub

Personal Monster Hunter Wilds utility hub.

## Contents

- Static local database pages generated from archived Traditional Chinese data.
- Global fuzzy search across local database entries.
- Saved build and damage calculator URL records.
- Weapon guide entry page with a local bow guide embed.

## Local Run

```powershell
.\Start-WildsHub.ps1
```

Then open:

```text
http://localhost:8080/
```

Large crawler output and SQLite files under `data/kiranico/` are intentionally not committed.
