# 🍼 Baby Shower App

Web del baby shower (sábado 5 de diciembre · Granaderos Puntanos 326, Santa Rosa).
Sitio estático (GitHub Pages) + Supabase (base de datos, fotos y tiempo real). Sin servidor que mantener.

| Página | Para quién | Qué hace |
|---|---|---|
| `index.html` | Invitados (antes) | Invitación, cuenta regresiva, confirmar asistencia, foto de bebé, predicciones |
| `regalos.html` | Invitados | Lista de regalos con reserva (no se repiten) |
| `jugar.html` | Invitados (el día, por QR) | Trivia y votaciones en vivo, subir fotos, libro de deseos |
| `pantalla.html` | Proyector | Bienvenida + QR, galería, pregunta con barras en vivo, ranking, deseos (con voz opcional), predicciones |
| `admin.html` | Ustedes | Controlar el proyector, lanzar/revelar preguntas, asistencia, regalos, moderación, ZIP de fotos, libro de deseos en PDF |

## Puesta en marcha (una vez, ~10 min)

### 1. Supabase
1. Crear cuenta y proyecto gratis en https://supabase.com (región São Paulo).
2. Abrir `supabase/schema.sql`, **reemplazar `CAMBIAR@EMAIL.COM` por tu email**, pegarlo en **SQL Editor** y **Run**.
3. **Authentication → Users → Add user → Create new user**: mismo email + contraseña (tildar *Auto Confirm User*).
4. **Authentication → Sign In / Providers**: desactivar *Allow new users to sign up*.
5. **Project Settings → API**: copiar `Project URL` y la key `anon public` en `config.js`.

### 2. GitHub Pages
1. El repo tiene que ser **público** (Settings → General → Change visibility). Pages gratis solo funciona con repos públicos.
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. En ~1 minuto queda en `https://prietodaniel.github.io/babyShowerApp/`.

## El día del evento
- En la notebook o Raspberry del proyector abrir `pantalla.html` (un click = pantalla completa; tecla **V** = leer los deseos en voz alta).
- En tu celular abrir `admin.html` para manejar todo.
- Los invitados escanean el QR de la pantalla. Funciona con datos móviles, no depende del WiFi del salón.

## Antes del evento
- Editar los textos de `config.js` (nombre del bebé, papás, horario).
- En **admin → Preguntas** cargar la respuesta correcta de cada trivia (las de ejemplo vienen sin respuesta).
- Cuando lleguen las fotos de bebé: **"Crear preguntas desde fotos de bebé"** y agregarles una pista graciosa.
