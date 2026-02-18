#!/bin/bash

# 🚀 Script de Deployment Automatizado - FleetCore PWA
# =====================================================

set -e  # Detener si hay errores

echo "╔════════════════════════════════════════════╗"
echo "║   🚀 DEPLOYMENT FLEETCORE PWA              ║"
echo "║   Mina Nuevo Cobre - 4000m                 ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# PASO 1: Verificar que estamos en el directorio correcto
echo "📂 Verificando directorio del proyecto..."
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: No se encuentra package.json"
    echo "   Ejecuta este script desde la raíz del proyecto"
    exit 1
fi
echo "✅ Directorio correcto"
echo ""

# PASO 2: Verificar archivos PWA
echo "🔍 Verificando archivos PWA..."
MISSING_FILES=0

if [ ! -f "public/manifest.json" ]; then
    echo "❌ Falta: public/manifest.json"
    MISSING_FILES=1
fi

if [ ! -f "public/sw.js" ]; then
    echo "❌ Falta: public/sw.js"
    MISSING_FILES=1
fi

if [ ! -f "src/registerSW.js" ]; then
    echo "❌ Falta: src/registerSW.js"
    MISSING_FILES=1
fi

if [ $MISSING_FILES -eq 1 ]; then
    echo ""
    echo "⚠️  ADVERTENCIA: Faltan archivos PWA"
    echo "   La app funcionará pero sin capacidades offline"
    read -p "   ¿Continuar de todas formas? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Todos los archivos PWA presentes"
fi
echo ""

# PASO 3: Limpiar build anterior
echo "🧹 Limpiando build anterior..."
if [ -d "dist" ]; then
    rm -rf dist
    echo "✅ Directorio dist eliminado"
else
    echo "ℹ️  No hay build anterior"
fi
echo ""

# PASO 4: Instalar dependencias (opcional)
echo "📦 ¿Deseas reinstalar dependencias?"
read -p "   Esto puede tomar varios minutos (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📥 Instalando dependencias..."
    npm install
    echo "✅ Dependencias instaladas"
else
    echo "⏭️  Saltando instalación de dependencias"
fi
echo ""

# PASO 5: Build de producción
echo "🔨 Construyendo aplicación para producción..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ ERROR: El build falló, no se generó el directorio dist"
    exit 1
fi
echo "✅ Build completado exitosamente"
echo ""

# PASO 6: Verificar archivos críticos en dist
echo "🔍 Verificando archivos en dist..."
CRITICAL_FILES=("dist/index.html" "dist/manifest.json" "dist/sw.js")
ALL_PRESENT=1

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ Falta: $file"
        ALL_PRESENT=0
    fi
done

if [ $ALL_PRESENT -eq 0 ]; then
    echo ""
    echo "⚠️  ADVERTENCIA: Faltan archivos críticos en dist"
    read -p "   ¿Continuar con el deployment? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# PASO 7: Verificar login de Firebase
echo "🔐 Verificando autenticación de Firebase..."
if ! firebase projects:list &> /dev/null; then
    echo "❌ No estás autenticado en Firebase"
    echo "   Ejecuta: firebase login"
    exit 1
fi
echo "✅ Autenticado en Firebase"
echo ""

# PASO 8: Deploy
echo "🚀 Desplegando a Firebase Hosting..."
echo "   Proyecto: mpf-maquinaria"
echo ""

firebase deploy --only hosting

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   ✅ DEPLOYMENT COMPLETADO                 ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "🌐 Tu app está disponible en:"
firebase hosting:channel:list | grep "live" || echo "   https://mpf-maquinaria.web.app"
echo ""
echo "📱 Próximos pasos:"
echo "   1. Abre la URL en tu celular"
echo "   2. Prueba la instalación (Agregar a pantalla de inicio)"
echo "   3. Activa modo avión y verifica que funcione offline"
echo ""
echo "🏔️  ¡Listo para Mina Nuevo Cobre a 4000m! ⛏️"
echo ""
