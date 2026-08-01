# Parcialito Builder

Constructor de cuestionarios estilo Google Forms / Microsoft Forms, pensado para
parciales de cátedra. Sin instalación: es HTML/CSS/JS puro, corre en cualquier
navegador y se publica gratis con **GitHub Pages**.

Ya viene cargado con el ejemplo real **"PARCIALITO LAMINA Nro. 0"** para que el
profesor lo vea funcionando de entrada.

## Qué incluye esta primera fase

- ✅ Editor de cuestionarios (secciones, preguntas, puntaje por pregunta)
- ✅ Tipos de pregunta: dato identificatorio (texto/opción), respuesta corta
  de texto, respuesta corta numérica, opción múltiple, con imagen opcional
  en el enunciado
- ✅ Corrector automático:
  - texto → ignora mayúsculas/minúsculas y tildes, acepta varias respuestas válidas
  - número → acepta coma o punto como separador decimal, acepta varias respuestas válidas
  - opción múltiple → una sola correcta
- ✅ Vista previa / "rendir" para probar la corrección antes de imprimir el examen
- ✅ Exportar el cuestionario a `.json` y generar un enlace + QR de prueba

## Qué falta para producción (fase 2 — a definir con el profesor)

- Registro real de respuestas en una planilla (Excel/Google Sheets), organizado
  por comisión
- QR estable por comisión/fecha (hoy el QR de prueba funciona sin servidor,
  pero para escalarlo a muchos alumnos conviene alojar el formulario como
  archivo en `forms/` y sumar un backend liviano para guardar respuestas)
- Configuraciones anti-copia (orden aleatorio de preguntas/opciones, tiempo
  límite, un solo envío por alumno, bloqueo de copiar/pegar, etc.)

## Cómo publicarlo en GitHub Pages

1. Creá un repositorio nuevo en GitHub (puede ser privado o público).
2. Subí estos archivos tal cual están (`index.html`, `take.html`, la carpeta
   `assets/` y `forms/`), manteniendo la misma estructura de carpetas.
3. En el repo: **Settings → Pages → Source** → elegí la rama `main` y la
   carpeta `/ (root)`. Guardá.
4. GitHub te va a dar una URL tipo:
   `https://tu-usuario.github.io/nombre-del-repo/`
5. Esa es la página del **constructor** (`index.html`). Se ve, se edita y se
   prueba ahí mismo, sin instalar nada.

## Cómo lo usa el profesor

1. Entra a la URL del constructor → pestaña **"01 · Editor"**.
2. Puede tocar **"Cargar ejemplo del profe"** para ver el parcialito ya armado,
   o **"Formulario en blanco"** para empezar uno nuevo.
3. Agrega secciones y preguntas con los botones **"+ Agregar sección"** / **"+ ..."**.
4. En **"02 · Vista previa / Rendir"** prueba el cuestionario como si fuera alumno.
5. En **"03 · Compartir / Exportar"**:
   - descarga el `.json` del cuestionario (para guardarlo o subirlo al repo)
   - copia el enlace o muestra el QR en pantalla para que los alumnos lo escaneen
     y lo respondan desde el celular (funciona ya, sin necesidad de más
     configuración — es la base sobre la que se conecta el registro en Excel
     en la fase 2)

## Estructura de archivos

```
index.html          → constructor (uso del profesor)
take.html           → vista para que el alumno rinda (a donde apunta el QR)
assets/style.css     → estilos
assets/app.js        → lógica del constructor y la corrección
forms/               → (fase 2) acá van a vivir los .json de cada parcial publicado
```
