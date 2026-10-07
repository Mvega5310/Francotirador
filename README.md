# Mercenario de Azotea — Documento de Diseño y Arquitectura

## 1. Premisa
No es un juego de feria de tiro ni un shooter genérico de guerra: eres un
mercenario apostado en una azotea, contratado para limpiar una calle de una
oleada de delincuencia callejera. Tus objetivos NO son soldados ni blancos de
práctica — son **ladrones en plena fuga**: arrebatadores de bolsos, roba-zapatos
en un puesto ambulante, ladrones de carros parqueados y atracadores de bus.

La calle también tiene civiles caminando normalmente. Dispararle a un civil por
error tiene consecuencias serias. El corazón del juego ya no es solo la
puntería — es **identificar antes de disparar**.

## 2. Concepto de juego
- **Punto de vista:** azotea fija con vista a una calle concurrida (mismo
  esquema de cámara fija + mira que la versión anterior).
- **Civiles ambientales:** caminan tranquilos por la acera todo el tiempo,
  sin cargar nada. Son decorado y riesgo — nunca deben ser el blanco.
- **Incidentes (los verdaderos blancos):** cada cierto tiempo aparece un
  delincuente que **corre** (no camina) y **carga visiblemente el objeto
  robado**. Esa combinación — correr + cargar algo — es la única señal
  fiable de quién es el ladrón.
- **Tipos de incidente:**
  1. **Arrebato de bolso** — corre por la acera cercana cargando un bolso
     (caja rosa).
  2. **Robo en puesto de zapatos** — sale corriendo de un puesto ambulante
     cargando un par de zapatos (caja café).
  3. **Robo de carro** — corre hacia un carro parqueado cargando las llaves;
     si llega al carro y arranca, el caso se pierde (huye).
  4. **Atraco a bus** — corre hacia la puerta de un bus detenido cargando el
     botín (caja dorada); si aborda antes de que dispares, el caso se pierde.
- **Consecuencias:**
  - Acertar al ladrón antes de que escape → **caso resuelto** (+100 pts).
  - Dejar que el ladrón llegue a su punto de escape (carro/bus/callejón) →
    **caso perdido** (sin penalización de puntos, pero cuenta en tu registro
    de efectividad).
  - Dispararle a un civil → **penalización fuerte** (-150 pts) y suma una
    falta. **3 faltas = misión terminada** (fin de la ronda antes de tiempo).

## 3. Arquitectura técnica

### 3.1 Qué cambia respecto al prototipo anterior
Reutilizamos toda la base de sistemas ya construida (Three.js, raycasting,
mira con zoom, viento, sway, aliento, munición, HUD) — lo que cambia es el
**sistema de objetivos**: en vez de blancos estáticos con anillos, ahora son
figuras humanas que **caminan o corren por rutas definidas**, con un sistema
de identificación visual (¿corre? ¿carga algo?) en lugar de un centro fijo
que apuntar.

### 3.2 Estructura de archivos (sin cambios)
```
Mercenario/
├── index.html      # Canvas 3D + overlays de UI (HUD, mira, pantallas)
├── style.css        # Estilos del HUD y efecto visual de la mira
├── game.js          # Toda la lógica: escena, disparo, NPCs, HUD
├── vendor/
│   └── three.module.js   # Three.js empaquetado localmente (sin depender de un CDN)
└── README.md         # Este documento
```

### 3.3 Modelo de datos actualizado
```js
npc = {
  group: THREE.Group,        // cuerpo (cápsula) + cabeza (esfera) [+ ítem robado]
  type: "civilian" | "thief",
  crimeType: "bolso" | "zapatos" | "carro" | "bus" | null,
  path: { start: {x,z}, exit: {x,z} },
  speed: number,              // civiles caminan lento, ladrones corren
  progress: 0,                 // 0 a 1 a lo largo del path
  active: true
}

gameState = {
  score: 0,
  casosResueltos: 0,
  casosPerdidos: 0,
  civilesHeridos: 0,          // faltas — 3 termina la ronda
  ammo, reloading, timeLeft, wind, breath, holdingBreath, scoped   // igual que antes
}
```

### 3.4 Sistemas nuevos/modificados
- **Sistema de civiles ambientales** — genera peatones que caminan en línea
  recta por la acera a velocidad baja y constante, de forma continua durante
  toda la ronda (ruido visual + riesgo moral).
- **Sistema de incidentes** — cada cierto intervalo (con algo de aleatoriedad)
  lanza un ladrón de un tipo aleatorio, con su ítem robado visible y una
  velocidad de fuga mayor a la de los civiles.
- **Sistema de disparo (modificado)** — el raycaster ahora intersecta figuras
  humanas (grupos con cápsula + cabeza [+ ítem]); al impactar, se determina
  si era civil o ladrón y se aplican las consecuencias correspondientes.
- **Sistema de faltas** — cuenta civiles heridos; al llegar a 3, termina la
  ronda de inmediato (como una misión fallida), igual que si se acaba el
  tiempo.
- **Props de escenario** — carros parqueados, un bus detenido y un puesto de
  zapatos ambulante, posicionados en los puntos de escape de cada tipo de
  incidente (para que el jugador entienda hacia dónde corre cada ladrón).

## 4. Roadmap incremental
1. ✅ Civiles ambientales + incidentes de 4 tipos + sistema de faltas (este prototipo)
2. Animación de carro/bus huyendo cuando el ladrón llega a su punto de escape
   (en vez de solo desaparecer)
3. Dificultad progresiva: más incidentes simultáneos y civiles más densos
   conforme avanza el tiempo
4. Diálogo/radio de contrato (voz en off tipo "objetivo confirmado, calle
   Rosales") para reforzar la premisa de mercenario
5. Modelos 3D reales de personas en vez de cápsulas + esferas

## 5. Cómo correrlo en VSC
1. Abre la carpeta `sniper-3d/` en VSC.
2. Instala la extensión "Live Server". **Sigue siendo obligatorio**, aunque
   Three.js ya no dependa de internet: los módulos ES (`type="module"`) no
   cargan si abres el `index.html` con doble clic (protocolo `file://`) — el
   navegador los bloquea por seguridad. Necesitas que se sirva por `http://`.
3. Clic derecho en `index.html` → "Open with Live Server".
4. Si la pantalla queda en negro y el HUD no cambia de sus valores por
   defecto, abre la consola del navegador (F12 → pestaña "Console") — ahí
   aparecerá el error exacto en rojo.
5. Clic izquierdo = disparar. Clic derecho o tecla Z = mira. Shift = contener
   respiración. R = recargar.
6. **Regla de oro:** si corre y carga algo, es el objetivo. Si camina con las
   manos vacías, es un civil — no dispares.

## 6. Actualización visual: gente real y mejor paisaje

### 6.1 Modelo humano
Se reemplazaron las figuras de cápsula + esfera por un **modelo humano 3D real,
articulado y animado** ("CesiumMan"), cargado como archivo `.glb`.
- **Fuente:** [Khronos glTF-Sample-Models](https://github.com/KhronosGroup/glTF-Sample-Models)
- **Licencia:** Creative Commons Attribution 4.0 — donado por Cesium.
- Cada NPC es un **clon independiente** del mismo modelo (usando
  `SkeletonUtils.clone`, necesario porque un `.clone()` normal no copia bien
  el esqueleto/huesos de un modelo animado), con su propio
  `AnimationMixer` para que cada uno camine a su propio ritmo sin verse
  sincronizado con los demás.
- La animación de caminar se reutiliza también para "correr": se le sube la
  velocidad de reproducción (`timeScale`) a los ladrones. Es una técnica común
  cuando solo se tiene un clip de animación disponible.
- **Limitación conocida:** todos los NPC comparten el mismo modelo/textura
  (no hay variedad de ropa/apariencia), porque es el único modelo humano
  gratuito con animación de caminata lista para usar sin más trabajo de
  modelado. Ver roadmap para cómo escalar esto.
- Si al probarlo los personajes caminan "de lado" en vez de hacia el frente,
  ajusta la constante `HUMAN_FACING_OFFSET` en `game.js` en pasos de 90°
  (`Math.PI / 2`) hasta que se vea correcto — la orientación exacta de un
  modelo importado no siempre es predecible sin verlo renderizado.

### 6.2 Paisaje mejorado
- **Texturas procedurales** (generadas por código, sin depender de imágenes
  externas): asfalto con línea central, concreto de acera, y fachadas de
  edificio con ventanas iluminadas aleatoriamente.
- **Sombras reales** activadas (`renderer.shadowMap`), con el sol como luz
  que proyecta sombra.
- **Cielo con degradado** en vez de color plano.
- **Farolas** (con "foco" emisivo) y **árboles** decorativos a lo largo de
  las aceras.
- Pantalla de carga mientras se descarga el modelo `.glb` (~480 KB) antes de
  iniciar la ronda.

### 6.3 Nueva estructura de archivos
```
Mercenario/
├── index.html
├── style.css
├── game.js
├── README.md
└── vendor/
    ├── three.module.js
    ├── models/
    │   └── CesiumMan.glb        # modelo humano animado (CC-BY, Cesium)
    └── jsm/
        ├── loaders/GLTFLoader.js
        └── utils/
            ├── BufferGeometryUtils.js
            └── SkeletonUtils.js
```

### 6.4 Roadmap de variedad visual (siguiente nivel)
1. Clonar el material y aplicar tintes de color sutiles por NPC para simular
   variedad de ropa sin necesitar modelos distintos.
2. Sumar 1–2 modelos humanos gratuitos más (ej. de Mixamo, que permite
   descargar personajes rigged gratis) y elegir uno al azar por NPC.
3. Reemplazar los árboles/farolas de primitivas por modelos `.glb` de bajo
   poligonaje (ej. de Kenney.nl, todo CC0).
