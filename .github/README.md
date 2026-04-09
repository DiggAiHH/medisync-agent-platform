# GitHub Codespaces Konfiguration

Dieser Ordner enthält die Konfiguration für GitHub Codespaces.

## One-Click Deployment

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/DiggAiHH/medisync-agent-platform)

## Prebuilds

Prebuilds sind konfiguriert für:
- **Branches**: `master`, `develop`, `feature/*`, `release/*`
- **Schedule**: Täglich um 03:00 UTC
- **Regions**: `us-west2`, `us-east1`, `europe-west1`, `asia-northeast1`

### Manuelle Prebuild Auslösung

```bash
gh workflow run prebuild.yml
```

## Struktur

```
.github/
├── codespaces/
│   └── prebuild.yml          # Prebuild Konfiguration
├── workflows/
│   └── prebuild.yml          # GitHub Action für Prebuilds
└── ISSUE_TEMPLATE/
    ├── bug_report.md         # Bug Report Template
    ├── feature_request.md    # Feature Request Template
    └── config.yml            # Issue Template Konfiguration
```

## Troubleshooting

### Prebuild failed

1. Checke die Workflow Logs unter Actions → Prebuild
2. Prüfe ob alle Dependencies installierbar sind
3. Stelle sicher, dass alle Build-Scripts funktionieren

### Codespace startet nicht

1. Versuche einen neuen Codespace zu erstellen
2. Prüfe die DevContainer Logs
3. Erstelle ein Issue mit dem "codespaces" Label
