# MediSync Agenten-Plattform - Makefile
# =====================================

.PHONY: help install start stop test build deploy clean logs health status

# Default target
.DEFAULT_GOAL := help

# Colors for output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m # No Color

help: ## Zeige diese Hilfe an
	@echo "$(BLUE)MediSync Agenten-Plattform$(NC)"
	@echo "=========================="
	@echo ""
	@echo "$(GREEN)Verfügbare Befehle:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

install: ## Installation aller Dependencies
	@echo "$(BLUE)🔧 Installiere Dependencies...$(NC)"
	@./scripts/install.sh

start: ## Starte alle Services
	@echo "$(GREEN)🚀 Starte MediSync Plattform...$(NC)"
	@docker-compose up -d
	@echo "$(GREEN)✅ Services gestartet!$(NC)"
	@echo ""
	@echo "$(BLUE)Verfügbare Endpunkte:$(NC)"
	@echo "  • API:      http://localhost:3000"
	@echo "  • WebSocket: ws://localhost:8080"
	@echo "  • Dashboard: http://localhost:5173"
	@echo "  • Redis:    redis://localhost:6379"

start-dev: ## Starte im Development Modus
	@echo "$(BLUE)🚀 Starte im Development Modus...$(NC)"
	@docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

stop: ## Stoppe alle Services
	@echo "$(YELLOW)🛑 Stoppe alle Services...$(NC)"
	@docker-compose down
	@echo "$(GREEN)✅ Services gestoppt$(NC)"

stop-volumes: ## Stoppe Services und entferne Volumes
	@echo "$(RED)⚠️  Stoppe Services und entferne Volumes...$(NC)"
	@docker-compose down -v
	@echo "$(GREEN)✅ Services und Volumes entfernt$(NC)"

restart: stop start ## Starte alle Services neu

status: ## Zeige Status aller Services
	@echo "$(BLUE)📊 Service Status:$(NC)"
	@docker-compose ps

logs: ## Zeige Logs aller Services
	@docker-compose logs -f --tail=100

logs-backend: ## Zeige Backend Logs
	@docker-compose logs -f backend --tail=100

logs-worker: ## Zeige Worker Logs
	@docker-compose logs -f worker --tail=100

logs-bot: ## Zeige Bot Logs
	@docker-compose logs -f discord-bot --tail=100

test: ## Führe alle Tests aus
	@echo "$(BLUE)🧪 Führe Tests aus...$(NC)"
	@npm test
	@echo "$(GREEN)✅ Tests abgeschlossen$(NC)"

build: ## Baue alle Services
	@echo "$(BLUE)🔨 Baue alle Services...$(NC)"
	@npm run build
	@echo "$(GREEN)✅ Build abgeschlossen$(NC)"

docker-build: ## Baue Docker Images
	@echo "$(BLUE)🐳 Baue Docker Images...$(NC)"
	@docker-compose build --no-cache
	@echo "$(GREEN)✅ Docker Images gebaut$(NC)"

health: ## Prüfe Gesundheit aller Services
	@echo "$(BLUE)🏥 Führe Health Checks durch...$(NC)"
	@./scripts/health-check.sh

deploy: ## Deployment
	@echo "$(BLUE)🚀 Starte Deployment...$(NC)"
	@./scripts/deploy.sh

clean: ## Bereinige das Projekt
	@echo "$(YELLOW)🧹 Bereinige Projekt...$(NC)"
	@docker-compose down -v --rmi all --remove-orphans
	@rm -rf backend/dist backend/node_modules
	@rm -rf bot/discord/dist bot/discord/node_modules
	@rm -rf dashboard/dist dashboard/node_modules
	@rm -rf node_modules
	@echo "$(GREEN)✅ Projekt bereinigt$(NC)"

update: ## Aktualisiere alle Dependencies
	@echo "$(BLUE)⬆️  Aktualisiere Dependencies...$(NC)"
	@npm update
	@cd backend && npm update
	@cd bot/discord && npm update
	@cd dashboard && npm update
	@echo "$(GREEN)✅ Dependencies aktualisiert$(NC)"

backup: ## Backup der Redis Daten
	@echo "$(BLUE)💾 Erstelle Backup...$(NC)"
	@mkdir -p backups
	@docker exec medisync-redis redis-cli BGSAVE
	@docker cp medisync-redis:/data/dump.rdb backups/redis-backup-$(shell date +%Y%m%d-%H%M%S).rdb
	@echo "$(GREEN)✅ Backup erstellt$(NC)"

shell-backend: ## Öffne Shell im Backend Container
	@docker exec -it medisync-backend sh

shell-worker: ## Öffne Shell im Worker Container
	@docker exec -it medisync-worker sh

shell-redis: ## Öffne Redis CLI
	@docker exec -it medisync-redis redis-cli

monitor: ## Starte Monitoring Stack
	@echo "$(BLUE)📊 Starte Monitoring Stack...$(NC)"
	@docker-compose --profile monitoring up -d
	@echo "$(GREEN)✅ Monitoring gestartet$(NC)"
	@echo "  • Prometheus: http://localhost:9090"
	@echo "  • Grafana:    http://localhost:3001"

monitor-stop: ## Stoppe Monitoring Stack
	@echo "$(YELLOW)🛑 Stoppe Monitoring Stack...$(NC)"
	@docker-compose --profile monitoring down

# Entwicklungs-Hilfen
dev-backend: ## Starte Backend im Dev Modus
	@cd backend && npm run dev

dev-bot: ## Starte Bot im Dev Modus
	@cd bot/discord && npm run dev

dev-dashboard: ## Starte Dashboard im Dev Modus
	@cd dashboard && npm run dev

dev-all: ## Starte alle Services im Dev Modus (parallel)
	@npx concurrently \
		"$(MAKE) dev-backend" \
		"$(MAKE) dev-bot" \
		"$(MAKE) dev-dashboard" \
		--names "backend,bot,dashboard" \
		--prefix-colors "blue,green,yellow"

# GitHub Codespaces Support
codespace-setup: ## Setup für GitHub Codespaces
	@echo "$(BLUE)🔧 Setup für GitHub Codespaces...$(NC)"
	@./scripts/install.sh
	@cp .env.codespaces.example .env
	@echo "$(GREEN)✅ Codespace Setup abgeschlossen$(NC)"

codespace-urls: ## Zeige URLs für GitHub Codespaces
	@echo "$(BLUE)🌐 Codespace URLs:$(NC)"
	@echo "  • API:       https://${CODESPACE_NAME}-3000.github.dev"
	@echo "  • WebSocket: wss://${CODESPACE_NAME}-8080.github.dev"
	@echo "  • Dashboard: https://${CODESPACE_NAME}-5173.github.dev"

# Kurzbefehle
up: start ## Alias für start
down: stop ## Alias für stop
ps: status ## Alias für status
l: logs ## Alias für logs
h: health ## Alias für health
