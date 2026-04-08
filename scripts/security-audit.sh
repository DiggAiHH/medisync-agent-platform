#!/bin/bash
# =============================================================================
# MediSync Security Audit Script
# =============================================================================
# Führt automatisierte Sicherheitschecks durch
# 
# Verwendung: ./scripts/security-audit.sh
# =============================================================================

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter
ERRORS=0
WARNINGS=0

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          MediSync Security Audit                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# 1. Check for secrets in code
# =============================================================================
echo "🔍 Checking for secrets in code..."

# Patterns to search for
SECRET_PATTERNS=(
    "password\s*=\s*['\"][^'\"]+['\"]"
    "secret\s*=\s*['\"][^'\"]+['\"]"
    "token\s*=\s*['\"][^'\"]+['\"]"
    "api_key\s*=\s*['\"][^'\"]+['\"]"
    "private_key\s*=\s*['\"][^'\"]+['\"]"
    "sk-[a-zA-Z0-9]{48}"  # OpenAI API Key pattern
    "ghp_[a-zA-Z0-9]{36}"  # GitHub PAT pattern
    "ghs_[a-zA-Z0-9]{36}"  # GitHub App token
)

for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -r -i --include="*.ts" --include="*.js" --include="*.json" "$pattern" backend/ bot/ dashboard/ 2>/dev/null | grep -v node_modules | grep -v ".backup" | head -5; then
        echo -e "${RED}❌ Potential secret found matching pattern: $pattern${NC}"
        ((ERRORS++))
    fi
done

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ No obvious secrets found in code${NC}"
fi

echo ""

# =============================================================================
# 2. Check .env files
# =============================================================================
echo "🔍 Checking .env files..."

ENV_FILES=(
    "backend/.env"
    "bot/discord/.env"
    "dashboard/.env"
)

for env_file in "${ENV_FILES[@]}"; do
    if [ -f "$env_file" ]; then
        echo -e "${RED}❌ Found uncommitted .env file: $env_file${NC}"
        ((ERRORS++))
    fi
done

# Check if .env.example exists
EXAMPLE_FILES=(
    "backend/.env.example"
    "bot/discord/.env.example"
    "dashboard/.env.example"
)

for example in "${EXAMPLE_FILES[@]}"; do
    if [ ! -f "$example" ]; then
        echo -e "${RED}❌ Missing .env.example file: $example${NC}"
        ((ERRORS++))
    fi
done

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All .env files properly handled${NC}"
fi

echo ""

# =============================================================================
# 3. Check .gitignore
# =============================================================================
echo "🔍 Checking .gitignore configuration..."

REQUIRED_IGNORES=(
    ".env"
    ".env.*"
    "node_modules/"
    "dist/"
    "*.log"
)

for ignore in "${REQUIRED_IGNORES[@]}"; do
    if ! grep -q "$ignore" .gitignore 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Missing in .gitignore: $ignore${NC}"
        ((WARNINGS++))
    fi
done

if [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ .gitignore properly configured${NC}"
fi

echo ""

# =============================================================================
# 4. npm audit
# =============================================================================
echo "🔍 Running npm audit..."

cd backend
if npm audit --audit-level=high 2>/dev/null; then
    echo -e "${GREEN}✅ Backend: No high/critical vulnerabilities${NC}"
else
    echo -e "${RED}❌ Backend: Vulnerabilities found${NC}"
    ((ERRORS++))
fi
cd ..

cd bot/discord
if npm audit --audit-level=high 2>/dev/null; then
    echo -e "${GREEN}✅ Bot: No high/critical vulnerabilities${NC}"
else
    echo -e "${RED}❌ Bot: Vulnerabilities found${NC}"
    ((ERRORS++))
fi
cd ../..

cd dashboard
if npm audit --audit-level=high 2>/dev/null; then
    echo -e "${GREEN}✅ Dashboard: No high/critical vulnerabilities${NC}"
else
    echo -e "${RED}❌ Dashboard: Vulnerabilities found${NC}"
    ((ERRORS++))
fi
cd ..

echo ""

# =============================================================================
# 5. Check for outdated packages
# =============================================================================
echo "🔍 Checking for outdated packages..."

cd backend
OUTDATED=$(npm outdated --json 2>/dev/null | wc -l)
if [ "$OUTDATED" -gt 1 ]; then
    echo -e "${YELLOW}⚠️  Backend: $(($OUTDATED - 1)) outdated packages${NC}"
    ((WARNINGS++))
else
    echo -e "${GREEN}✅ Backend: All packages up to date${NC}"
fi
cd ..

echo ""

# =============================================================================
# 6. Check Docker security
# =============================================================================
echo "🔍 Checking Docker configuration..."

if [ -f "docker-compose.prod.yml" ]; then
    # Check for root user
    if grep -q "user: \"1000:1000\"" docker-compose.prod.yml; then
        echo -e "${GREEN}✅ Docker containers run as non-root${NC}"
    else
        echo -e "${YELLOW}⚠️  Docker containers should run as non-root${NC}"
        ((WARNINGS++))
    fi
    
    # Check for resource limits
    if grep -q "resources:" docker-compose.prod.yml; then
        echo -e "${GREEN}✅ Resource limits configured${NC}"
    else
        echo -e "${YELLOW}⚠️  Resource limits not configured${NC}"
        ((WARNINGS++))
    fi
    
    # Check for read_only
    if grep -q "read_only: true" docker-compose.prod.yml; then
        echo -e "${GREEN}✅ Read-only root filesystem enabled${NC}"
    else
        echo -e "${YELLOW}⚠️  Consider enabling read-only root filesystem${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}❌ docker-compose.prod.yml not found${NC}"
    ((ERRORS++))
fi

echo ""

# =============================================================================
# 7. Check TypeScript strict mode
# =============================================================================
echo "🔍 Checking TypeScript configuration..."

if [ -f "backend/tsconfig.json" ]; then
    if grep -q '"strict": true' backend/tsconfig.json; then
        echo -e "${GREEN}✅ TypeScript strict mode enabled${NC}"
    else
        echo -e "${YELLOW}⚠️  TypeScript strict mode not enabled${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}❌ backend/tsconfig.json not found${NC}"
    ((ERRORS++))
fi

echo ""

# =============================================================================
# 8. Check SECURITY.md
# =============================================================================
echo "🔍 Checking SECURITY.md..."

if [ -f "SECURITY.md" ]; then
    echo -e "${GREEN}✅ SECURITY.md exists${NC}"
    
    # Check for required sections
    if grep -q "Reporting Process" SECURITY.md; then
        echo -e "${GREEN}✅ Reporting process documented${NC}"
    else
        echo -e "${YELLOW}⚠️  Reporting process not documented${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "${RED}❌ SECURITY.md not found${NC}"
    ((ERRORS++))
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
echo "════════════════════════════════════════════════════════════════"
echo "                      AUDIT SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All security checks passed!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  $WARNINGS warnings found (no critical errors)${NC}"
    exit 0
else
    echo -e "${RED}❌ $ERRORS errors and $WARNINGS warnings found${NC}"
    echo "Please fix the errors before deployment."
    exit 1
fi
