# Integración segura con Fatmorbus Core — By Fatmorbus

Guía para los módulos **By Fatmorbus** que se enganchan al Core.
Regla base: **un módulo nunca debe romperse porque el Core no esté instalado,
esté desactivado, se cargue después, o falle.**

---

## 1. La forma recomendada (a prueba de orden de carga)

```js
Hooks.once("init", () => {
  Hooks.callAll("fatmorbusRegisterModule", {
    id: "mi-modulo-by-fatmorbus",
    name: "Mi Módulo — By Fatmorbus",
    description: "Descripción corta para el panel central del hub.",
    iconClass: "fa-solid fa-skull",
    tools: [
      {
        id: "abrir-herramienta",
        label: "Abrir Herramienta",
        icon: "fa-solid fa-wrench",
        action: () => miHerramienta()
      }
    ],
    sceneControls: [
      { control: "tokens", tool: "mi-boton-antiguo" }
    ]
  });
});
```

Por qué es la mejor opción:

- `Hooks.callAll` **no necesita que el Core exista**. Si el Core no está
  instalado, la llamada simplemente no la escucha nadie: cero errores, cero
  dependencia dura.
- **No depende del orden de carga.** El Core registra el listener en el momento
  en que se evalúa su script, antes de cualquier `init`.
- El Core **sanitiza el payload** y nunca lanza excepciones hacia el módulo
  que lo llamó.

## 2. Alternativas válidas

```js
// Disponible apenas se evalúa el script del Core (antes de "init").
globalThis.FatmorbusCore?.registerModule({ id: "...", name: "..." });

// Disponible desde el hook "init" del Core en adelante.
game.fatmorbus?.registerModule({ id: "...", name: "..." });

// Ejecutar algo sólo cuando el Core esté listo (funciona incluso si ya lo está).
globalThis.FatmorbusCore?.whenReady(api => api.registerModule({ id: "..." }));

// Hook de disponibilidad.
Hooks.once("fatmorbusCoreReady", api => { /* ... */ });
```

**Siempre con `?.`**. Nunca `game.fatmorbus.registerModule(...)` sin optional
chaining: si el Core no está activo eso lanza `TypeError` y rompe tu `init`.

## 3. Qué NO hacer

| No hacer | Por qué |
| --- | --- |
| `"relationships.requires"` apuntando al Core | Convierte al Core en dependencia obligatoria. Debe ser opcional. |
| Llamar a la API fuera de un hook, en el top level | El Core puede no haberse evaluado todavía. Usa el hook. |
| Asumir que `registerModule` devolvió `true` | Devuelve `false` si el payload es inválido; nunca lanza. |
| Declarar `sceneControls` de botones que no son tuyos | El Core sólo oculta lo declarado por su propio dueño. |
| Enviar funciones en `icon` / `iconClass` | Se descartan: sólo se aceptan clases FontAwesome `[a-z0-9 _-]`. |

## 4. Campos aceptados por `registerModule`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | **Obligatorio.** Debe coincidir con el id del módulo en Foundry. |
| `name` | string | Título mostrado. Por defecto se usa el `title` del manifest. |
| `description` | string | Texto del panel central. |
| `version` | string | Por defecto se usa la versión del manifest. |
| `iconClass` | string | Clase FontAwesome. Si se omite, el Core asigna un emblema por palabra clave. |
| `icon` | string | Ruta de imagen. Se rechazan `javascript:`, `data:` y `vbscript:`. |
| `tools[]` | array | `{ id, label, icon, action }`. También acepta `onClick` / `callback` / `hook`. |
| `tools[].visible` | bool/función | Se evalúa dentro de try/catch. |
| `tools[].gmOnly` | bool | Oculta la herramienta a jugadores. |
| `sceneControls[]` | array | `{ control, tool }` o `"nombre-control"`. Sólo para consolidar TUS propios botones. |

Cualquier campo desconocido o mal tipado se descarta silenciosamente en vez de
romper el registro.

## 5. Garantías del Core hacia los módulos

- `registerModule` / `registerTool` **nunca lanzan**; devuelven `true`/`false`.
- Los handlers de `getSceneControlButtons`, `renderCompendiumDirectory`,
  `renderSidebarTab` y `changeSidebarTab` están envueltos en try/catch: un fallo
  del Core no puede romper la barra de herramientas ni la sidebar de terceros.
- Las lecturas de settings del Core usan un lector seguro con valor por defecto.
- El Core **nunca oculta** controles de escena que no hayan sido declarados
  explícitamente por su propio módulo.
- El Core **nunca mueve, copia, renombra ni fusiona** compendios. Sólo indexa y
  muestra carpetas virtuales. Los UUID originales siguen siendo los válidos.
- Al ocultar packs en el directorio nativo se usa coincidencia **exacta** de
  `collection`: nunca se oculta un compendio de terceros por parecido de nombre.
- Las acciones de las herramientas (`tools[].action`) se ejecutan dentro de
  try/catch con notificación de error, nunca revientan el Core.

## 6. Verificación de integridad

Un módulo firmado incluye `fatmorbus-integrity.json` en su raíz. Estados:

| Estado | Significado |
| --- | --- |
| `verified` | Firma RSA válida y todos los SHA-256 coinciden. |
| `unsigned` | No hay manifiesto, no se pudo leer, o la verificación está desactivada. Es un estado **neutro**, no una alerta. |
| `modified` | Hay manifiesto firmado pero la firma, la versión o un hash no coinciden. |

Un módulo sin firmar **no se marca nunca como alterado**. Si subes la versión de
un módulo firmado, debes volver a firmarlo o quedará en `modified`.

## 7. Declarar el Core como dependencia obligatoria

Un módulo By Fatmorbus que **necesite** el Core lo declara en su propio
`module.json`. Con la URL del manifiesto, Foundry ofrece descargarlo e
instalarlo solo si falta:

```json
"relationships": {
  "requires": [
    {
      "id": "fatmorbus-core-by-fatmorbus",
      "type": "module",
      "manifest": "https://raw.githubusercontent.com/jeanforetcretier-hue/fatmorbus-core-/main/module.json",
      "compatibility": { "minimum": "1.5.3" }
    }
  ]
}
```

`compatibility.minimum` de la relación es la versión mínima **del Core**, no de
Foundry. Súbela sólo cuando el módulo use algo que no existiera antes.

Recuerda que el canal recomendado del apartado 1 (`fatmorbusRegisterModule`)
**no** requiere el Core instalado: úsalo si prefieres que tu módulo funcione
solo y gane las herramientas del Core cuando esté presente. La dependencia
obligatoria es para módulos que sin el Core no tienen nada que hacer.
