# Cloudflare Tunnel Quickstart

Schnellstart-Anleitung für Cloudflare Tunnel in GitHub Codespaces.

## TL;DR - Schnellstart

```bash
# 1. Temporäre URLs (keine Domain nötig)
bash scripts/temp-tunnel.sh --all

# 2. Persistente URLs (mit eigener Domain)
bash scripts/setup-tunnel.sh

# 3. Status prüfen
bash scripts/status.sh
```

---

## Option 1: Temporäre URLs (2 Minuten)

**Perfekt für:** Demos, Tests, kurze Sessions

```bash
# Alle Services tunneln
bash scripts/temp-tunnel.sh --all

# Oder einzelnen Service
bash scripts/temp-tunnel.sh 3000  # API
bash scripts/temp-tunnel.sh 8080  # WebSocket
```

**Ausgabe:**
```
✓ API (Backend)
   URL: https://abc123.trycloudflare.com

✓ WebSocket Server
   URL: https://def456.trycloudflare.com
...
```

**Hinweis:** URLs ändern sich bei jedem Neustart.

---

## Option 2: Persistente URLs (10 Minuten)

**Perfekt für:** Produktivumgebungen, Team-Entwicklung

### Schritt 1: Domain bei Cloudflare einrichten

1. [cloudflare.com](https://cloudflare.com) → Sign Up
2. Add Site → Ihre Domain (z.B. `ihrefirma.de`)
3. Nameserver bei Registrar ändern (Cloudflare zeigt welche)
4. Warten auf "Active" Status (5-30 Min)

### Schritt 2: Tunnel erstellen

```bash
bash scripts/setup-tunnel.sh
```

**Interaktive Eingaben:**
- Tunnel-Name: `medisync-agents`
- Domain: `ihrefirma.de`

**Ausgabe:**
```
Tunnel erstellt mit ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Schritt 3: Token kopieren

1. Öffnen Sie: https://dash.cloudflare.com
2. Zero Trust → Access → Tunnels → Ihr Tunnel
3. Configure → Docker
4. Token kopieren (beginnt mit `eyJ...`)

### Schritt 4: Token in GitHub speichern

1. https://github.com/settings/codespaces
2. New secret
   - Name: `CF_TUNNEL_TOKEN`
   - Value: [Ihr Token]
3. Add secret

### Schritt 5: Codespace neu starten

```bash
# Tunnel startet automatisch
bash scripts/status.sh  # URLs anzeigen
```

**Ihre URLs:**
- `https://api.ihrefirma.de`
- `https://ws.ihrefirma.de`
- `https://code.ihrefirma.de`
- `https://dashboard.ihrefirma.de`

---

## Befehlsübersicht

```bash
# Status aller Services
bash scripts/status.sh

# Temporäre Tunnels
bash scripts/temp-tunnel.sh --all      # Alle Services
bash scripts/temp-tunnel.sh --api      # Nur API
bash scripts/temp-tunnel.sh --stop     # Alle stoppen

# Persistenter Tunnel
bash scripts/setup-tunnel.sh           # Setup durchführen
bash .devcontainer/cloudflared/start.sh # Manuelles Starten

# Hilfe
bash scripts/status.sh --help
bash scripts/temp-tunnel.sh --help
```

---

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| `CF_TUNNEL_TOKEN nicht gesetzt` | Token in GitHub Secrets hinzufügen |
| `Connection refused` | Services prüfen: `bash scripts/status.sh` |
| `DNS nicht gefunden` | 5-10 Min warten (DNS-Propagierung) |
| WebSocket bricht ab | Cloudflare Dashboard → Network → WebSockets ON |

---

## Nächste Schritte

- Detaillierte Anleitung: [`TUNNEL_SETUP.md`](./TUNNEL_SETUP.md)
- Für Admins: Enterprise-Setup im vollständigen Guide
