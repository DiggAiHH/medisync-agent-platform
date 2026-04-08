# Cloudflare Tunnel Setup für MediSync Agents Platform

Diese Anleitung beschreibt die Einrichtung von Cloudflare Tunnels für persistente URLs zu Ihren GitHub Codespaces.

## Überblick

Cloudflare Tunnel bietet:
- **Persistente URLs** - Gleiche URL für jeden Codespace-Neustart
- **Sichere Verbindung** - Ende-zu-Ende-Verschlüsselung
- **Keine öffentliche IP nötig** - Funktioniert hinter NAT/Firewall
- **DSGVO-konform** - Keine Daten werden bei Cloudflare gespeichert (nur Routing)

---

## Option 1: Persistenter Tunnel (Empfohlen)

Für produktive Umgebungen mit eigener Domain.

### Voraussetzungen

- Cloudflare Account (kostenlos)
- Eigene Domain (bei Cloudflare gehostet)
- GitHub Codespaces Zugang

### Schritt-für-Schritt Anleitung

#### 1. Cloudflare Account erstellen

1. Besuchen Sie [cloudflare.com](https://www.cloudflare.com/)
2. Klicken Sie auf "Sign Up"
3. Folgen Sie dem Registrierungsprozess
4. Bestätigen Sie Ihre E-Mail-Adresse

#### 2. Domain zu Cloudflare hinzufügen

1. Melden Sie sich bei [dash.cloudflare.com](https://dash.cloudflare.com) an
2. Klicken Sie auf "Add a Site"
3. Geben Sie Ihre Domain ein (z.B. `example.com`)
4. Wählen Sie den kostenlosen Plan
5. Cloudflare zeigt Ihnen Nameserver
6. Ändern Sie die Nameserver bei Ihrem Domain-Registrar
7. Warten Sie auf die Propagierung (bis zu 24 Stunden)

**Status prüfen:**
- In der Cloudflare Dashboard sollte Ihre Domain als "Active" angezeigt werden

#### 3. Tunnel erstellen

**Option A: Automatisch mit Setup-Skript**

```bash
# Im Codespace Terminal
bash scripts/setup-tunnel.sh
```

Das Skript:
1. Installiert cloudflared
2. Führt Cloudflare-Login durch
3. Erstellt einen neuen Tunnel
4. Richtet DNS-Einträge ein
5. Zeigt den Tunnel-Token an

**Option B: Manuell über Dashboard**

1. Gehen Sie zu: [dash.cloudflare.com](https://dash.cloudflare.com)
2. Wählen Sie Ihre Domain
3. Gehen Sie zu: **Zero Trust** → **Access** → **Tunnels**
4. Klicken Sie auf **"Create a tunnel"**
5. Wählen Sie **"Cloudflared"**
6. Geben Sie einen Namen ein (z.B. `medisync-agents`)
7. Klicken Sie auf **"Save tunnel"**
8. Kopieren Sie den angezeigten Token (beginnt mit `eyJ...`)

#### 4. DNS-Einträge konfigurieren

Fügen Sie folgende Hostnames für Ihren Tunnel hinzu:

| Subdomain | Service | Lokaler Port |
|-----------|---------|--------------|
| api | MediSync API | 3000 |
| ws | WebSocket Server | 8080 |
| code | Code Server | 8443 |
| dashboard | React Dashboard | 5173 |

**Im Dashboard:**
1. Unter "Public Hostnames" auf "Add a public hostname"
2. Subdomain: `api`, Domain: `example.com`
3. Type: HTTP, URL: `localhost:3000`
4. Wiederholen für alle Services

#### 5. Token in Codespaces hinterlegen

1. Gehen Sie zu: [github.com/settings/codespaces](https://github.com/settings/codespaces)
2. Klicken Sie auf **"New secret"**
3. **Name:** `CF_TUNNEL_TOKEN`
4. **Value:** Ihr kopierter Token (beginnt mit `eyJ...`)
5. Klicken Sie auf **"Add secret"**

Optional: Weitere Secrets für Hostnames:
- `CF_API_HOSTNAME` (z.B. `api.example.com`)
- `CF_WS_HOSTNAME` (z.B. `ws.example.com`)
- `CF_CODE_HOSTNAME` (z.B. `code.example.com`)
- `CF_DASHBOARD_HOSTNAME` (z.B. `dashboard.example.com`)

#### 6. Tunnel starten

```bash
# Im Codespace Terminal
bash .devcontainer/cloudflared/start.sh
```

Oder automatisch beim Start (bereits in devcontainer.json konfiguriert):
```bash
docker-compose up cloudflared
```

#### 7. Testen

Öffnen Sie Ihre konfigurierten URLs:
- `https://api.example.com` → API Backend
- `https://ws.example.com` → WebSocket Server
- `https://code.example.com` → Code Server
- `https://dashboard.example.com` → Dashboard

---

## Option 2: Temporärer Tunnel (Schnelltest)

Für Demos und kurze Tests ohne eigene Domain.

```bash
# Einzelnen Service tunneln
bash scripts/temp-tunnel.sh 3000

# Alle Services tunneln
bash scripts/temp-tunnel.sh --all
```

**Merkmale:**
- Keine Domain nötig
- URLs sehen aus wie: `https://abc123.trycloudflare.com`
- URLs ändern sich bei jedem Neustart
- Gut für Demos und Tests

---

## Konfigurationsreferenz

### Umgebungsvariablen

| Variable | Beschreibung | Beispiel |
|----------|-------------|----------|
| `CF_TUNNEL_TOKEN` | Tunnel-Token (erforderlich) | `eyJ...` |
| `CF_TUNNEL_ID` | Tunnel-ID (optional) | `12345-abc` |
| `CF_API_HOSTNAME` | API Hostname | `api.example.com` |
| `CF_WS_HOSTNAME` | WebSocket Hostname | `ws.example.com` |
| `CF_CODE_HOSTNAME` | Code Server Hostname | `code.example.com` |
| `CF_DASHBOARD_HOSTNAME` | Dashboard Hostname | `dashboard.example.com` |

### Docker Compose Konfiguration

Der cloudflared-Service ist bereits in `docker-compose.yml` konfiguriert:

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  container_name: medisync-cloudflared
  command: tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}
  environment:
    - CF_TUNNEL_TOKEN=${CF_TUNNEL_TOKEN}
  depends_on:
    devcontainer:
      condition: service_started
  restart: unless-stopped
  networks:
    - medisync-network
  user: "65532:65532"  # Non-root user
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  cap_add:
    - NET_BIND_SERVICE
  read_only: true
```

---

## Troubleshooting

### Tunnel startet nicht

**Symptom:** `CF_TUNNEL_TOKEN ist nicht gesetzt!`

**Lösung:**
1. Prüfen Sie GitHub Codespaces Secrets
2. Starten Sie den Codespace neu
3. Alternativ: Verwenden Sie `scripts/temp-tunnel.sh`

### Verbindung verweigert

**Symptom:** `connection refused` oder `502 Bad Gateway`

**Lösung:**
```bash
# Prüfe ob Services laufen
bash scripts/status.sh

# Starte Services neu
docker-compose restart devcontainer

# Prüfe Cloudflare-Logs
tail -f /var/log/cloudflared/tunnel.log
```

### DNS-Fehler

**Symptom:** `DNS_PROBE_FINISHED_NXDOMAIN`

**Lösung:**
1. Warten Sie 5-10 Minuten (DNS-Propagierung)
2. Prüfen Sie DNS-Einträge im Cloudflare Dashboard
3. Löschen und neu erstellen Sie den DNS-Eintrag

### WebSocket-Probleme

**Symptom:** WebSocket-Verbindung bricht ab

**Lösung:**
- Stellen Sie sicher, dass `websocketTimeout` in config.yml gesetzt ist
- Prüfen Sie Cloudflare Einstellungen → Network → WebSockets (sollte ON sein)

---

## Security Best Practices

1. **Token niemals committen**
   ```bash
   # .gitignore
   .env
   .env.*
   *.json
   .tunnel_id
   ```

2. **Verwenden Sie least-privilege**
   - Der Tunnel-Token hat nur Zugriff auf den spezifischen Tunnel
   - Kein Zugriff auf andere Cloudflare-Ressourcen

3. **Regelmäßige Token-Rotation**
   - Erstellen Sie neue Tunnels alle 90 Tage
   - Löschen Sie alte, nicht verwendete Tunnels

4. **HTTPS erzwingen**
   - Im Cloudflare Dashboard: SSL/TLS → Overview → Full (strict)

---

## Für GitHub Enterprise Admins

### Organisation-weite Secrets

Für Teams können Sie Secrets auf Organisationsebene konfigurieren:

1. GitHub → Ihre Organisation → Settings
2. Codespaces → Secrets
3. New organization secret
4. Verfügbarkeit: Alle Repositories oder ausgewählte

### Prebuilds mit Tunnel

Damit Tunnels in Prebuilds funktionieren:

```json
// devcontainer.json
{
  "onCreateCommand": "bash .devcontainer/cloudflared/start.sh"
}
```

**Wichtig:** Der Token muss beim Prebuild verfügbar sein.

### Netzwerkrichtlinien

Wenn Ihre Organisation ausgehenden Traffic beschränkt:

```
# Erforderliche Domains für Cloudflare Tunnel
*.cloudflare.com
*.cloudflared.com
*.trycloudflare.com
*.argotunnel.com
```

---

## Weitere Ressourcen

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [GitHub Codespaces Secrets](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-encrypted-secrets-for-your-codespaces)
- [cloudflared GitHub](https://github.com/cloudflare/cloudflared)

---

## Support

Bei Problemen:
1. Prüfen Sie `scripts/status.sh`
2. Sehen Sie in die Logs: `/var/log/cloudflared/tunnel.log`
3. Öffnen Sie ein Issue im Repository
