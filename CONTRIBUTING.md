# Contributing to MediSync Agent Platform

Vielen Dank für dein Interesse an der MediSync Agent Platform! Dieses Dokument beschreibt den Entwicklungs-Workflow und wie du zum Projekt beitragen kannst.

## 📋 Inhalt

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Commit Convention](#commit-convention)
- [Pull Request Prozess](#pull-request-prozess)
- [Release Prozess](#release-prozess)

---

## Code of Conduct

Dieses Projekt folgt dem [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Durch die Teilnahme wird erwartet, dass du diesen Standards folgst.

## Development Setup

### Schnellstart mit GitHub Codespaces

Der einfachste Weg, mit der Entwicklung zu beginnen:

1. Klicke auf **"Code"** → **"Codespaces"** → **"Create codespace on main"**
2. Warte ~2-3 Minuten bis der Codespace bereit ist
3. Alle Services starten automatisch
4. Öffne das Dashboard in deinem Browser

### Lokale Entwicklung

Wenn du lokal entwickeln möchtest:

```bash
# Repository klonen
git clone https://github.com/DiggAiHH/medisync-agent-platform.git
cd medisync-agent-platform

# DevContainer starten (VS Code)
code .
# → "Reopen in Container" wählen

# Oder manuell mit Docker Compose
docker-compose -f .devcontainer/docker-compose.yml up -d
```

### Systemanforderungen

| Komponente | Minimum | Empfohlen |
|------------|---------|-----------|
| CPU | 2 Cores | 4+ Cores |
| RAM | 4 GB | 8+ GB |
| Storage | 10 GB | 20+ GB |
| Node.js | 18.x | 20.x LTS |

## Development Workflow

### 1. Branch erstellen

```bash
# Aktuellsten Stand holen
git checkout main
git pull origin main

# Feature-Branch erstellen
git checkout -b feature/deine-feature-beschreibung

# Oder für Bugfixes:
git checkout -b fix/bug-beschreibung
```

### Branch-Naming

| Prefix | Verwendung | Beispiel |
|--------|------------|----------|
| `feature/` | Neue Features | `feature/dark-mode` |
| `fix/` | Bugfixes | `fix/auth-redirect` |
| `docs/` | Dokumentation | `docs/api-examples` |
| `refactor/` | Refactoring | `refactor/queue-worker` |
| `test/` | Tests | `test/websocket-handler` |
| `chore/` | Wartung | `chore/update-deps` |

### 2. Entwickeln

```bash
# Dependencies installieren
npm run install:all

# Alle Services im Development-Modus starten
npm run dev

# Oder einzeln:
npm run dev:api      # API Server
npm run dev:worker   # Agent Worker
npm run dev:dashboard # Dashboard
npm run dev:bot      # Discord Bot
```

### 3. Code-Qualität sicherstellen

```bash
# Linting
npm run lint

# Tests ausführen
npm run test

# Type-Checking
npm run typecheck

# Build testen
npm run build
```

### 4. Commit & Push

```bash
# Änderungen stagen
git add .

# Commit mit konventioneller Message
git commit -m "feat: add dark mode toggle"

# Push zu deinem Fork/Branch
git push origin feature/deine-feature-beschreibung
```

## Commit Convention

Wir verwenden [Conventional Commits](https://www.conventionalcommits.org/) für einheitliche Commit-Messages.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Beschreibung |
|------|--------------|
| `feat` | Neues Feature |
| `fix` | Bugfix |
| `docs` | Dokumentationsänderungen |
| `style` | Code-Formatierung (keine funktionalen Änderungen) |
| `refactor` | Code-Refactoring |
| `perf` | Performance-Verbesserungen |
| `test` | Tests hinzufügen/ändern |
| `chore` | Wartungsaufgaben |
| `ci` | CI/CD Änderungen |
| `build` | Build-System Änderungen |

### Scopes

| Scope | Beschreibung |
|-------|--------------|
| `api` | Backend API |
| `worker` | Agent Worker |
| `dashboard` | React Dashboard |
| `bot` | Discord Bot |
| `extension` | VS Code Extension |
| `shared` | Shared Code |
| `deps` | Dependencies |
| `config` | Konfiguration |

### Beispiele

```bash
# Feature
feat(api): add job priority queue

# Bugfix
fix(worker): handle redis connection timeout

# Mit Body
feat(dashboard): add real-time job stats

- Add WebSocket connection for live updates
- Display job queue length and processing time
- Update every 5 seconds

Closes #123

# Breaking Change
feat(api)!: change auth response format

BREAKING CHANGE: Auth response now returns user object instead of token only
```

## Pull Request Prozess

### 1. PR erstellen

1. Push deinen Branch zu GitHub
2. Erstelle einen Pull Request gegen `main`
3. Fülle die PR-Beschreibung aus

### 2. PR Template

```markdown
## Beschreibung
Kurze Beschreibung der Änderungen

## Änderungstyp
- [ ] Bugfix
- [ ] Feature
- [ ] Breaking Change
- [ ] Dokumentation

## Checkliste
- [ ] Tests geschrieben/ausgeführt
- [ ] Code kommentiert (bei komplexer Logik)
- [ ] Dokumentation aktualisiert
- [ ] Changelog aktualisiert (bei User-facing Changes)

## Screenshots (falls relevant)

## Verwandte Issues
Closes #123
```

### 3. Review Prozess

1. **Automated Checks**: CI muss grün sein
2. **Code Review**: Mindestens 1 Approval erforderlich
3. **Manuelle Tests**: Reviewer testen die Änderungen
4. **Merge**: Squash & Merge nach Approval

### Review Guidelines

**Für Reviewer:**
- Sei konstruktiv und respektvoll
- Frage nach, wenn etwas unklar ist
- Teste die Änderungen lokal wenn möglich
- Achte auf:
  - Code-Qualität und Lesbarkeit
  - Testabdeckung
  - Dokumentation
  - Performance

**Für Autoren:**
- Reagiere zeitnah auf Feedback
- Erkläre komplexe Entscheidungen
- Akzeptiere Alternativvorschläge offen
- Force-push nur bei Bedarf

## Release Prozess

### Versionierung

Wir folgen [Semantic Versioning](https://semver.org/):

```
MAJOR.MINOR.PATCH
```

- **MAJOR**: Breaking Changes
- **MINOR**: Neue Features (rückwärtskompatibel)
- **PATCH**: Bugfixes

### Release Schritte

1. **Version bumpen**
   ```bash
   npm version minor  # oder major/patch
   ```

2. **Changelog aktualisieren**
   - Änderungen seit dem letzten Release sammeln
   - Kategorisieren (Added, Changed, Fixed, Removed)

3. **Release erstellen**
   ```bash
   git push origin main --tags
   ```

4. **GitHub Release**
   - Neue Version taggen
   - Release Notes schreiben
   - Assets anhängen (falls relevant)

## Projektstruktur

```
agents-platform/
├── backend/              # API Server & Worker
│   ├── src/
│   │   ├── routes/       # API Endpoints
│   │   ├── worker/       # Agent Worker
│   │   ├── ai/           # AI Integration
│   │   └── queue/        # Job Queue
│   └── package.json
├── dashboard/            # React Dashboard
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── api/
│   └── package.json
├── bot/discord/          # Discord Bot
│   ├── src/
│   │   ├── commands/
│   │   └── handlers/
│   └── package.json
├── code-server/          # Code Server Setup
│   └── extensions/       # VS Code Extensions
├── shared/               # Shared Types
└── docs/                 # Dokumentation
```

## Hilfe & Support

- **Fragen?** Öffne ein [Discussion](https://github.com/DiggAiHH/medisync-agent-platform/discussions)
- **Bug gefunden?** Erstelle ein [Issue](https://github.com/DiggAiHH/medisync-agent-platform/issues)
- **Feature Request?** Erstelle ein [Feature Issue](https://github.com/DiggAiHH/medisync-agent-platform/issues/new?template=feature_request.md)

## Danksagung

Vielen Dank an alle Contributors! 🎉

---

**Hinweis**: Diese Guidelines können sich ändern. Bitte prüfe vor dem Contribuieren, ob du die aktuellste Version liest.
