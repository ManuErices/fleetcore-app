/** @type {import('tailwindcss').Config} */

// Paleta del cuaderno de Finanzas. Los valores viven UNA vez, como variables
// CSS en src/index.css (:root). Aquí solo se referencian, con el formato de
// canales para que funcionen las opacidades (bg-cuaderno-hoja/60).
const cuaderno = (nombre) => `rgb(var(--cuaderno-${nombre}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        cuaderno: {
          papel:     cuaderno('papel'),      // fondo de la página
          hoja:      cuaderno('hoja'),       // tablas, pestaña activa
          tarjeta:   cuaderno('tarjeta'),    // fichas y modales
          separador: cuaderno('separador'),  // barra lateral (archivador)
          renglon:   cuaderno('renglon'),    // líneas de fila
          linea:     cuaderno('linea'),      // líneas de columna internas
          columna:   cuaderno('columna'),    // bordes y columnas principales
          margen:    cuaderno('margen'),     // margen rojo doble
          tinta:     cuaderno('tinta'),      // texto y cifras
          roja:      cuaderno('roja'),       // egresos y notas
          grafito:   cuaderno('grafito'),    // texto secundario
          verde:     cuaderno('verde'),      // visto bueno, pagado
          azul:      cuaderno('azul'),       // renglones de tarjeta índice
          menta:     cuaderno('menta'),      // resaltador: ingresos, pagado
          rosa:      cuaderno('rosa'),       // resaltador: egresos, vencido
          durazno:   cuaderno('durazno'),    // resaltador: semana en curso, pendiente
          lavanda:   cuaderno('lavanda'),    // resaltador: medio de pago
        },
      },
      fontFamily: {
        // Imprenta prolija para todo: texto, etiquetas, botones y cifras
        manuscrita: ['Handlee', '"Segoe Print"', 'cursive'],
        // Letra ligada escolar chilena: solo títulos y encabezados de sección
        ligada: ['"Playwrite CL"', '"Segoe Script"', 'cursive'],
      },
    },
  },
  plugins: [],
};
