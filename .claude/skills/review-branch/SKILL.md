---
name: review-branch
description: Evalúa una rama de desarrollo frente a main (qué hace, cuánto se ha separado, si sigue siendo aplicable, bugs) y recomienda fusionar, rebasar o cerrar. Usar cuando el usuario pida revisar, clasificar o comprobar el estado de una rama (o de todas las ramas abiertas).
---

# Revisar rama

Argumento: el nombre de una rama, o `all` para clasificar todas las ramas locales y remotas que no estén fusionadas en `main`.

Para cada rama:

1. Ejecutar `git fetch --all --prune` y recopilar: commits por delante/por detrás de `main` (`git rev-list --count`), fecha del último commit, `git log main..<rama>` y `git diff main...<rama> --stat`. Comprobar si existe un PR abierto (`gh pr list --head <rama>`).
2. Si la rama ya está fusionada (0 commits por delante) o sus cambios ya están en `main` a través de otra rama (se usan squash merges, así que hay que comparar el contenido del diff, no solo los commits), marcarla como **obsoleta**.
3. Si no, leer el diff completo (`git diff main...<rama>`) y el código que lo rodea. Evaluar:
   - Propósito y grado de terminación (¿está acabada? ¿hay TODOs? ¿faltan tests?).
   - Bugs de corrección e incumplimientos de las convenciones de CLAUDE.md.
   - Conflictos probables con el `main` actual (ficheros modificados en ambos lados desde el merge-base).
4. NO modificar la rama, ni rebasar, ni fusionar, ni hacer push. Solo lectura.

Resultado: para `all`, una tabla `rama | delante/detrás | último commit | estado (obsoleta / lista / necesita trabajo / con conflictos) | recomendación`, seguida de detalles solo para las ramas que merezca la pena conservar. Para una sola rama, un resumen breve, los hallazgos ordenados por gravedad y una recomendación (fusionar tal cual, rebasar y terminar, o cerrar).

El informe se escribe en español.
