#!/bin/bash

# Script de instalación rápida para importación Excel
# Ejecutar desde la raíz del proyecto React

echo "🚀 Instalando importación masiva desde Excel..."
echo ""

# 1. Instalar dependencia
echo "📦 Instalando librería xlsx..."
npm install xlsx
echo "✅ xlsx instalado"
echo ""

# 2. Crear directorio de componentes si no existe
echo "📁 Verificando estructura de carpetas..."
mkdir -p src/components
echo "✅ Carpetas verificadas"
echo ""

# 3. Copiar componente
echo "📄 Copiando ExcelImporter.jsx..."
if [ -f "ExcelImporter.jsx" ]; then
    cp ExcelImporter.jsx src/components/
    echo "✅ ExcelImporter.jsx copiado a src/components/"
else
    echo "❌ No se encontró ExcelImporter.jsx en el directorio actual"
    echo "   Asegúrate de estar en el directorio con los archivos descargados"
    exit 1
fi
echo ""

echo "🎉 Instalación completada!"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Revisa INTEGRACION_EXCEL.md para ver las instrucciones completas"
echo "   2. Agrega el botón de importación en src/pages/Machines.jsx"
echo "   3. Agrega los nuevos campos (patente, marca, modelo) al formulario"
echo "   4. Conecta el importador con Firebase siguiendo la guía"
echo ""
echo "💡 Para probar:"
echo "   npm run dev"
