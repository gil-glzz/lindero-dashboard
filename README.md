# Lindero — Dashboard de cercas digitales

Panel web para gestionar cercas virtuales, lotes de ganado y perfiles de animales.

## Desplegar en Render (Static Site)

1. Sube esta carpeta a un repositorio de GitHub
2. En Render: New + → Static Site
3. Conecta este repositorio
4. Configuración:
   - Build Command: (dejar vacío)
   - Publish Directory: `.` (punto)
5. Create Static Site

Render servirá `index.html` automáticamente en la raíz de la URL.

## Conectar al servidor real

Antes de subir, edita `index.html`:

1. Línea ~430, cambia la URL del servidor:
   ```js
   const API_BASE = 'https://TU-SERVIDOR.onrender.com';
   ```
2. Última línea del script, activa el polling:
   ```js
   setInterval(actualizarDesdeServidor, 30000);
   ```

Sin estos cambios, el dashboard funciona con datos de demostración.
