# GUARDIAN — Contexto de dominios cifrado (V1)

## Comportamiento

Las listas de confianza y bloqueo se usan normalmente durante una sesión, incluso si no se guarda nada. **No se vuelven a escribir en texto claro en `localStorage`.** Para conservarlas tras cerrar el navegador, el operador debe ingresar una frase secreta de 12 caracteres o más y pulsar **Guardar cifrado / Desbloquear**.

La copia persistente utiliza **Web Crypto AES-256-GCM**, una clave no exportable derivada de la frase secreta mediante **PBKDF2-HMAC-SHA-256 (310.000 iteraciones)**, sal aleatoria de 128 bits y nonce aleatorio de 96 bits por guardado. La contraseña y la clave derivada no se guardan. Cada sesión necesita desbloqueo.

Los cambios realizados mientras la clave está desbloqueada se guardan cifrados. **Bloquear** vacía las listas visibles en memoria y espera los guardados pendientes. **Eliminar copias locales** solicita confirmación antes de borrar tanto la copia cifrada como la antigua. **Exportar sin cifrar** descarga explícitamente un JSON que debe guardarse de forma segura.

## Migración desde la versión anterior

Cuando existe `rumboGuardianDomainListsV03` (texto claro), la aplicación lo carga temporalmente para no perder el contexto. Muestra un aviso de migración. La clave antigua **solo se elimina después de escribir y descifrar correctamente** la nueva copia cifrada; una contraseña incorrecta, un error de cifrado o el almacenamiento bloqueado no deben eliminarla. La migración combina listas cifradas y listas anteriores, dando prioridad al bloqueo ante conflictos.

Hasta que el usuario migre o elimine el almacenamiento antiguo, **los datos heredados siguen expuestos en texto claro**. No se elimina contenido del usuario silenciosamente. No se genera ni envía una clave de recuperación.

## Límites del modelo de protección

- El cifrado protege las listas persistentes en reposo contra una lectura directa del almacenamiento del navegador. **No** protege contra código malicioso que se ejecute en el mismo origen mientras la lista esté desbloqueada, extensiones con acceso privilegiado, malware o robo de contraseña.
- La fortaleza depende de una frase secreta elegida por el operador; PBKDF2 no vuelve segura una contraseña débil.
- El historial de análisis `rumboGuardianHistory` sigue siendo una función y almacenamiento separados. Este cambio está limitado al contexto de dominios y **no afirma cifrar el historial**.
- Los archivos descargados mediante **Exportar sin cifrar** no están cifrados.
- El frontend requiere Web Crypto en un contexto seguro (HTTPS o loopback seguro). Los datos cifrados no se envían a un servidor por esta función.

## Verificación

`node tests/domain-vault.test.js` prueba claves erróneas, manipulación de ciphertext, no reutilización de nonce, migración de datos antiguos, bloqueo y sesiones separadas, recuperación cifrada y una carrera de borrado contra un guardado pendiente. El test de fronteras del servidor verifica que `domain-vault.js` sea un recurso público explícito, sin abrir la ruta a archivos internos.
