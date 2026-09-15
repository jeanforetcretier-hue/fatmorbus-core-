# Changelog — Fatmorbus Core — By Fatmorbus

## 1.5.3
- Published the module from its public GitHub repository, adding the `manifest` and `download` URLs so Foundry VTT can install and update **Fatmorbus Core** directly from a manifest link.
- Pointed the module `url` at the public repository so the package page links to the source and releases.
- Aligned the internal `CORE_VERSION` with `module.json` so the hub reports the same release version.
- This release ships **without** `fatmorbus-integrity.json`: Core reports itself as `unsigned` until the build is re-signed with the Fatmorbus protection kit.

## 1.5.2
- Shifted the **center presentation block** further left and tightened its internal spacing so the artwork and text sit more cleanly inside the main frame.
- Shifted the **Recognized Modules** panel further left and reduced row/action sizing so the module list stays better aligned inside the right frame column.
- Fine-tuned row spacing, icon sizing, and text sizing in the recognized modules list for a cleaner fit on long module names.

## 1.5.1
- Re-aligned **Recognized Modules** so the catalogue sits fully inside the right black panel, with more room for module names and smaller action buttons.
- Improved module-name wrapping so long module titles no longer collapse into excessively short ellipses.
- Repositioned **Social Media** into the upper footer box and moved the checkbox/social links into the lower footer box so the layout matches the provided template.
- Replaced text-only supported-system labels with the user-provided **official D&D 5e and Shadowdark logos**, preserving their original colors.
- Added direct links from those system logos to their Foundry VTT package pages.
- Replaced the frame asset with the latest user-provided empty presentation template.
- Preserved the always-on-top Fatmorbus tools, unified FATMORBUS compendium folder, automatic welcome behavior, virtual library, settings center, and signed integrity system.

## 1.5.0
- Rebuilt the presentation hub around the new official **2048 × 1060 empty Fatmorbus template**.
- Reorganized the presentation to match the requested layout: **Fatmorbus Core** title on top, **Supported System** on the left, main Fatmorbus presentation in the center, **Recognized Modules** on the right, and a dedicated **Social Media** footer.
- Preserved the black-and-white high-contrast visual direction; the new frame is converted to monochrome and displayed artwork is grayscale.
- Moved all social links and the “No volver a desplegar…” preference into the bottom inner frame so no additional icon dock appears below the presentation.
- Raised the **Module Console, Settings Center, and Fatmorbus Library** layers above the welcome hub and normal Foundry application windows so module options remain accessible in front of open windows.
- Simplified the native **Compendiums** organization to **one FATMORBUS folder only**. All By Fatmorbus packs appear directly inside it, sorted by module and pack name. No system/type subfolders are added.
- Source compendium packs remain untouched: IDs, UUIDs, module ownership, and physical storage are preserved.
- Continued to open the presentation on every world load unless the client marks the opt-out checkbox.

## 1.4.3
- Fixed the **bottom social links strip** so the welcome opt-out checkbox and the social links stay aligned in a single clean row, matching the intended frame layout.
- Tightened footer spacing, overflow handling, and text clipping to prevent the social area from rendering as a broken second row of large icons.
- Preserved the v1.4.2 behavior where the presentation opens whenever the world loads unless the user disables it with the opt-out checkbox.

## 1.4.2
- **Changed automatic presentation behavior:** the Fatmorbus Core presentation now opens on **every Foundry world load** while the client setting is enabled.
- The bottom checkbox **“No volver a desplegar esta casilla cuando se abre Foundry”** is now the explicit opt-out: once checked, the automatic presentation stops appearing for that client until the setting is enabled again.
- Fixed the displayed Core version so the hub and `module.json` report the same release version.
- Preserved the monochrome high-contrast UI and cleaned social footer introduced in v1.4.1.

## 1.4.1
- Refined the **Fatmorbus Core** hub into a pure **black-and-white high-contrast** presentation, removing the previous gold accent treatment.
- Cleaned and compacted the **bottom social links strip** so Discord, YouTube, Instagram, and Patreon sit cleanly inside the frame.
- Improved contrast for headings, labels, lists, and module rows to better match the requested monochrome editorial style.
- Applied grayscale treatment to displayed artwork/icons inside the hub for a more consistent visual identity.
- Prepared this build again for official distribution with integrity signing.

## 1.4.0
- **Corregido el layout del hub de presentación.** La v1.3.0 usaba unidades de viewport (`vw`) y `clamp()` dentro de un panel de tamaño fijo: en pantallas grandes o ventanas bajas el contenido crecía más que sus cajas y se recortaba (sección Links invisible, panel System cortado, texto central con scroll, nombres de módulos colapsados a ancho cero).
- El panel ahora se dibuja en un lienzo de diseño de **1456 x 816 px** (tamaño exacto de `fatmorbus-core-frame.png`) y se escala de forma uniforme con `transform: scale()`. El contenido cae siempre dentro de las aberturas del marco en cualquier resolución.
- Reposicionadas todas las regiones midiendo las aberturas reales del marco: el panel central ya no queda angosto ni desalineado respecto al arte.
- **Recognized Modules** rediseñado según la referencia: icono, nombre en dos líneas, versión y los tres botones (integridad / Settings Center / configuración) alineados a la derecha.
- Añadidos emblemas por defecto por palabra clave, para que la lista se vea como un catálogo aunque el módulo no registre icono propio.
- Panel central compactado: métricas y estado unificados en una sola línea inferior; scrollbar fina en vez de la barra nativa.
- **API de integración endurecida.** `registerModule` y `registerTool` ya nunca lanzan excepciones hacia el módulo que los llama, y el payload se sanitiza (tipos, clases FontAwesome, rutas de imagen).
- Nuevo canal de registro a prueba de orden de carga: `Hooks.callAll("fatmorbusRegisterModule", data)`. No requiere que el Core exista y no depende de qué script se evalúe primero.
- `globalThis.FatmorbusCore` se expone al evaluar el script (antes de `init`). Añadidos `FatmorbusCore.whenReady(cb)`, `FatmorbusCore.isReady` y el hook `fatmorbusCoreReady`.
- Todos los handlers de hooks compartidos (`getSceneControlButtons`, `renderCompendiumDirectory`, `renderSidebarTab`, `changeSidebarTab`) envueltos en try/catch: un fallo del Core ya no puede romper la barra de herramientas ni la sidebar de otros módulos.
- Lectura de settings del Core mediante un lector seguro con valor por defecto.
- **Corregido:** el ocultamiento de packs en el directorio nativo usaba coincidencia por sufijo y podía ocultar compendios de terceros (p. ej. `otrapkg.magic-items` coincidía con `items`). Ahora la coincidencia es exacta por `collection`.
- **Corregido:** abrir el Settings Center o la Biblioteca para un módulo mientras ya estaban abiertos cerraba la ventana en vez de cambiar de módulo.
- **Corregido:** fuga de listeners: el listener de `Escape` y el de `resize` no se retiraban al cerrar el hub.
- Verificación de integridad: resultados cacheados por sesión, rutas resueltas con `getRoute` (compatible con Foundry servido bajo prefijo de ruta) y estados reclasificados — un módulo sin firmar queda en `unsigned` (neutro) y nunca se marca como alterado por un manifiesto ausente o ilegible.
- Añadido `INTEGRATION.md` con el contrato de integración para el resto de los módulos By Fatmorbus.
- **Nota de firma:** este build se entrega **sin** `fatmorbus-integrity.json`, porque los archivos cambiaron y la firma anterior ya no corresponde. Hay que volver a firmarlo con el protection kit antes de distribuirlo.

## 1.3.0
- Reworked the main **Fatmorbus Core** welcome hub to match the new three-column distribution with a centered presentation panel and improved module list.
- Added a compact **Links** layout so all social links, including Patreon, remain visible.
- Added a bottom **“No volver a desplegar...”** checkbox wired to the welcome presentation client setting.
- Added direct actions in the **Recognized Modules** list for opening module settings and module configuration.
- Moved practical hub access away from the settings screen and kept access through the **left Scene Controls toolbar**.
- Updated the Scene Controls group title/icon to **Herramientas By Fatmorbus** for clearer access from the canvas.
- Added shared logo artwork inside the hub presentation and refreshed the visual layout.
- Preserved Fatmorbus Library, Settings Center, virtual compendium folders, and signed integrity verification.

## 1.2.0
- Added a single consolidated **Fatmorbus** Scene Control for the left Foundry controls bar.
- Added **Module Console** with dynamic By Fatmorbus module entries.
- Added **Settings Center** which discovers standard Foundry settings and registered settings submenus per module.
- Added **Fatmorbus Library**, a lazy virtual index across compendium packs from active By Fatmorbus modules.
- Added drag-and-drop support from Fatmorbus Library results using the original Compendium UUIDs.
- Added non-destructive **FATMORBUS virtual folders** to the native Compendium Directory. Packs are not copied, moved, renamed, or re-IDed.
- Added `game.fatmorbus` / `FatmorbusCore` integration API for future modules to register tools, metadata, and legacy Scene Control references.
- Added optional hiding of duplicate Scene Controls only when a module explicitly registers them or identifies them as Fatmorbus controls.
- Preserved the v1.1.0 welcome presentation, social links, Patreon, and RSA + SHA-256 integrity verification.

## 1.1.0
- Added the official Fatmorbus presentation frame and Patreon link.
- Added recognized module list and integrity presentation.

## 1.0.0
- Initial release with social hub and signed-integrity verification.
