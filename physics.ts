/** Lightweight rigid-body physics for MakeCode Arcade. */

//% color="#7b4dd8" weight=92 icon="\uf1b2" block="Shape Physics"
//% groups="['Create', 'Motion', 'Materials', 'World', 'Collisions', 'Properties', 'Advanced']"
namespace shapePhysics {
    export enum Shape {
        //% block="circle"
        Circle = 0,
        //% block="triangle"
        Triangle = 3,
        //% block="square"
        Square = 4,
        //% block="pentagon"
        Pentagon = 5,
        //% block="hexagon"
        Hexagon = 6
    }

    class Vec {
        x: number
        y: number
        constructor(x: number, y: number) {
            this.x = x
            this.y = y
        }
    }

    class Manifold {
        hit: boolean
        nx: number
        ny: number
        depth: number
        constructor() {
            this.hit = false
            this.nx = 0
            this.ny = 0
            this.depth = 0
        }
    }

    export class PhysicsBody {
        id: number
        shape: Shape
        radius: number
        x: number
        y: number
        vx: number
        vy: number
        forceX: number
        forceY: number
        rotation: number
        angularVelocity: number
        mass: number
        inverseMass: number
        restitution: number
        friction: number
        drag: number
        color: number
        isStatic: boolean
        gravityEnabled: boolean
        sprite: Sprite
        removed: boolean
        lastDrawAngle: number

        constructor(id: number, shape: Shape, x: number, y: number, radius: number, color: number) {
            this.id = id
            this.shape = shape
            this.radius = Math.max(2, radius)
            this.x = x
            this.y = y
            this.vx = 0
            this.vy = 0
            this.forceX = 0
            this.forceY = 0
            this.rotation = 0
            this.angularVelocity = 0
            this.mass = 1
            this.inverseMass = 1
            this.restitution = 0.4
            this.friction = 0.25
            this.drag = 0
            this.color = clampVisibleColor(color)
            this.isStatic = false
            this.gravityEnabled = true
            this.removed = false
            this.lastDrawAngle = -9999
            this.sprite = sprites.create(drawBodyImage(this), PhysicsSpriteKind.Body)
            this.sprite.setPosition(x, y)
        }
    }

    namespace PhysicsSpriteKind {
        export const Body = SpriteKind.create()
    }

    const EVENT_ID = 7520
    const EVENT_ANY_COLLISION = 1
    let bodies: PhysicsBody[] = []
    let nextBodyId = 1
    let installed = false
    let gravityX = 0
    let gravityY = 100
    let simulationEnabled = true
    let solverIterations = 2
    let boundsEnabled = true
    let boundLeft = 0
    let boundTop = 0
    let boundRight = 159
    let boundBottom = 119
    let previousContacts: string[] = []
    let currentContacts: string[] = []
    let lastBodyA: PhysicsBody = null
    let lastBodyB: PhysicsBody = null
    let lastOtherByBody: PhysicsBody[] = []

    /** Create a circle body. */
    //% blockId=shape_physics_create_circle
    //% block="create circle at x $x y $y radius $radius color $color"
    //% x.defl=80 y.defl=20 radius.defl=8 color.shadow=colorNumberPicker color.defl=8
    //% group="Create" weight=100
    export function createCircle(x: number, y: number, radius: number, color: number): PhysicsBody {
        return createBody(Shape.Circle, x, y, radius, color)
    }

    /** Create a regular triangle, square, pentagon, or hexagon. */
    //% blockId=shape_physics_create_polygon
    //% block="create $shape at x $x y $y size $radius color $color"
    //% x.defl=80 y.defl=20 radius.defl=10 color.shadow=colorNumberPicker color.defl=7
    //% group="Create" weight=90
    export function createPolygon(shape: Shape, x: number, y: number, radius: number, color: number): PhysicsBody {
        if (shape == Shape.Circle) return createCircle(x, y, radius, color)
        return createBody(shape, x, y, radius, color)
    }

    /** Create an axis-aligned rectangular platform. */
    //% blockId=shape_physics_create_platform
    //% block="create static platform at x $x y $y width $width height $height color $color"
    //% x.defl=80 y.defl=110 width.defl=140 height.defl=8 color.shadow=colorNumberPicker color.defl=1
    //% group="Create" weight=80
    export function createPlatform(x: number, y: number, width: number, height: number, color: number): PhysicsBody {
        const radius = Math.max(2, Math.idiv(Math.max(width, height), 2))
        const body = createBody(Shape.Square, x, y, radius, color)
        // A platform uses a custom four-point rectangle stored as scale factors.
        body.radius = radius
        body.mass = Math.max(1, width * height)
        body.inverseMass = 0
        body.isStatic = true
        body.gravityEnabled = false
        body.sprite.setImage(drawRectangleImage(width, height, body.color))
        body.sprite.setPosition(x, y)
        rectangleWidths.push(width)
        rectangleHeights.push(height)
        rectangleBodyIds.push(body.id)
        return body
    }

    let rectangleBodyIds: number[] = []
    let rectangleWidths: number[] = []
    let rectangleHeights: number[] = []

    function createBody(shape: Shape, x: number, y: number, radius: number, color: number): PhysicsBody {
        install()
        const body = new PhysicsBody(nextBodyId++, shape, x, y, radius, color)
        bodies.push(body)
        return body
    }

    /** Set linear velocity in pixels per second. */
    //% blockId=shape_physics_set_velocity
    //% block="set $body velocity x $vx y $vy"
    //% vx.defl=0 vy.defl=0 group="Motion" weight=100
    export function setVelocity(body: PhysicsBody, vx: number, vy: number) {
        if (!body) return
        body.vx = vx
        body.vy = vy
    }

    /** Apply a continuous force for this frame. */
    //% blockId=shape_physics_apply_force
    //% block="apply force x $fx y $fy to $body"
    //% fx.defl=0 fy.defl=-100 group="Motion" weight=90
    export function applyForce(body: PhysicsBody, fx: number, fy: number) {
        if (!body || body.isStatic) return
        body.forceX += fx
        body.forceY += fy
    }

    /** Apply an immediate velocity-changing impulse. */
    //% blockId=shape_physics_apply_impulse
    //% block="apply impulse x $ix y $iy to $body"
    //% ix.defl=0 iy.defl=-30 group="Motion" weight=80
    export function applyImpulse(body: PhysicsBody, ix: number, iy: number) {
        if (!body || body.isStatic) return
        body.vx += ix * body.inverseMass
        body.vy += iy * body.inverseMass
    }

    /** Move a body immediately. */
    //% blockId=shape_physics_set_position
    //% block="set $body position x $x y $y"
    //% group="Motion" weight=70
    export function setPosition(body: PhysicsBody, x: number, y: number) {
        if (!body) return
        body.x = x
        body.y = y
        body.sprite.setPosition(x, y)
    }

    /** Set rotation in degrees. */
    //% blockId=shape_physics_set_rotation
    //% block="set $body rotation to $degrees degrees"
    //% group="Motion" weight=60
    export function setRotation(body: PhysicsBody, degrees: number) {
        if (!body) return
        if (rectangleIndex(body) >= 0) return
        body.rotation = degrees
        refreshBodyImage(body, true)
    }

    /** Set rotation speed in degrees per second. */
    //% blockId=shape_physics_set_angular_velocity
    //% block="set $body rotation speed to $degreesPerSecond degrees per second"
    //% degreesPerSecond.defl=90 group="Motion" weight=50
    export function setAngularVelocity(body: PhysicsBody, degreesPerSecond: number) {
        if (body && rectangleIndex(body) < 0) body.angularVelocity = degreesPerSecond
    }

    /** Set mass. Larger values are harder to move. */
    //% blockId=shape_physics_set_mass
    //% block="set $body mass to $mass"
    //% mass.defl=1 mass.min=0.1 group="Materials" weight=100
    export function setMass(body: PhysicsBody, mass: number) {
        if (!body || body.isStatic) return
        body.mass = Math.max(0.1, mass)
        body.inverseMass = 1 / body.mass
    }

    /** Set bounciness from 0 to 100 percent. */
    //% blockId=shape_physics_set_bounciness
    //% block="set $body bounciness to $percent percent"
    //% percent.defl=40 percent.min=0 percent.max=100 group="Materials" weight=90
    export function setBounciness(body: PhysicsBody, percent: number) {
        if (body) body.restitution = Math.max(0, Math.min(100, percent)) / 100
    }

    /** Set surface friction from 0 to 100 percent. */
    //% blockId=shape_physics_set_friction
    //% block="set $body friction to $percent percent"
    //% percent.defl=25 percent.min=0 percent.max=100 group="Materials" weight=80
    export function setFriction(body: PhysicsBody, percent: number) {
        if (body) body.friction = Math.max(0, Math.min(100, percent)) / 100
    }

    /** Set air drag from 0 to 100 percent. */
    //% blockId=shape_physics_set_drag
    //% block="set $body air drag to $percent percent"
    //% percent.defl=0 percent.min=0 percent.max=100 group="Materials" weight=70
    export function setDrag(body: PhysicsBody, percent: number) {
        if (body) body.drag = Math.max(0, Math.min(100, percent)) / 100
    }

    /** Make a body immovable or dynamic. */
    //% blockId=shape_physics_set_static
    //% block="set $body static $enabled"
    //% enabled.defl=true group="Materials" weight=60
    export function setStatic(body: PhysicsBody, enabled: boolean) {
        if (!body) return
        body.isStatic = enabled
        body.inverseMass = enabled ? 0 : 1 / Math.max(0.1, body.mass)
        if (enabled) {
            body.vx = 0
            body.vy = 0
        }
    }

    /** Enable or disable gravity for one body. */
    //% blockId=shape_physics_enable_gravity
    //% block="set gravity for $body to $enabled"
    //% enabled.defl=true group="Materials" weight=50
    export function enableGravity(body: PhysicsBody, enabled: boolean) {
        if (body) body.gravityEnabled = enabled
    }

    /** Set world gravity in pixels per second squared. */
    //% blockId=shape_physics_set_gravity
    //% block="set world gravity x $gx y $gy"
    //% gx.defl=0 gy.defl=100 group="World" weight=100
    export function setGravity(gx: number, gy: number) {
        gravityX = gx
        gravityY = gy
    }

    /** Set solid world boundaries. */
    //% blockId=shape_physics_set_bounds
    //% block="set physics bounds left $left top $top right $right bottom $bottom"
    //% left.defl=0 top.defl=0 right.defl=159 bottom.defl=119 group="World" weight=90
    export function setWorldBounds(left: number, top: number, right: number, bottom: number) {
        boundLeft = left
        boundTop = top
        boundRight = Math.max(left + 1, right)
        boundBottom = Math.max(top + 1, bottom)
    }

    //% blockId=shape_physics_enable_bounds
    //% block="world bounds enabled $enabled"
    //% enabled.defl=true group="World" weight=80
    export function enableWorldBounds(enabled: boolean) {
        boundsEnabled = enabled
    }

    //% blockId=shape_physics_enable_simulation
    //% block="physics simulation enabled $enabled"
    //% enabled.defl=true group="World" weight=70
    export function enableSimulation(enabled: boolean) {
        simulationEnabled = enabled
    }

    /** Improve stability for stacks at a performance cost. */
    //% blockId=shape_physics_set_iterations
    //% block="set collision solver iterations to $iterations"
    //% iterations.defl=2 iterations.min=1 iterations.max=6 group="World" weight=60
    export function setSolverIterations(iterations: number) {
        solverIterations = Math.max(1, Math.min(6, iterations))
    }

    /** Run code when any new collision begins. */
    //% blockId=shape_physics_on_collision
    //% block="on physics collision"
    //% group="Collisions" weight=100
    export function onCollision(handler: () => void) {
        control.onEvent(EVENT_ID, EVENT_ANY_COLLISION, handler)
    }

    /** Run code when this body begins touching something. */
    //% blockId=shape_physics_on_body_collision
    //% block="on $body collision"
    //% group="Collisions" weight=90
    export function onBodyCollision(body: PhysicsBody, handler: () => void) {
        if (body) control.onEvent(EVENT_ID, 100 + body.id, handler)
    }

    //% blockId=shape_physics_collision_body_a
    //% block="collision body A"
    //% group="Collisions" weight=80
    export function collisionBodyA(): PhysicsBody {
        return lastBodyA
    }

    //% blockId=shape_physics_collision_body_b
    //% block="collision body B"
    //% group="Collisions" weight=70
    export function collisionBodyB(): PhysicsBody {
        return lastBodyB
    }

    /** Return the other participant for a body-collision event. */
    //% blockId=shape_physics_other_body
    //% block="other body touching $body"
    //% group="Collisions" weight=60
    export function otherBody(body: PhysicsBody): PhysicsBody {
        if (!body) return null
        return lastOtherByBody[body.id]
    }

    //% blockId=shape_physics_body_x
    //% block="$body x position"
    //% group="Properties" weight=100
    export function bodyX(body: PhysicsBody): number { return body ? body.x : 0 }

    //% blockId=shape_physics_body_y
    //% block="$body y position"
    //% group="Properties" weight=90
    export function bodyY(body: PhysicsBody): number { return body ? body.y : 0 }

    //% blockId=shape_physics_body_vx
    //% block="$body velocity x"
    //% group="Properties" weight=80
    export function velocityX(body: PhysicsBody): number { return body ? body.vx : 0 }

    //% blockId=shape_physics_body_vy
    //% block="$body velocity y"
    //% group="Properties" weight=70
    export function velocityY(body: PhysicsBody): number { return body ? body.vy : 0 }

    //% blockId=shape_physics_body_sprite
    //% block="$body sprite"
    //% group="Properties" weight=60
    export function bodySprite(body: PhysicsBody): Sprite { return body ? body.sprite : null }

    /** Remove a body and its sprite. */
    //% blockId=shape_physics_destroy_body
    //% block="destroy physics body $body"
    //% group="Advanced" weight=100
    export function destroyBody(body: PhysicsBody) {
        if (!body || body.removed) return
        body.removed = true
        body.sprite.destroy()
    }

    /** Remove all physics bodies. */
    //% blockId=shape_physics_clear
    //% block="destroy all physics bodies"
    //% group="Advanced" weight=90
    export function clear() {
        for (let body of bodies) {
            if (!body.removed) body.sprite.destroy()
        }
        bodies = []
        previousContacts = []
        rectangleBodyIds = []
        rectangleWidths = []
        rectangleHeights = []
        lastOtherByBody = []
    }

    function install() {
        if (installed) return
        installed = true
        game.onUpdate(function () {
            if (simulationEnabled) step()
        })
    }

    function step() {
        const dt = 1 / 60
        for (let body of bodies) {
            if (body.removed || body.isStatic) continue
            if (body.gravityEnabled) {
                body.vx += gravityX * dt
                body.vy += gravityY * dt
            }
            body.vx += body.forceX * body.inverseMass * dt
            body.vy += body.forceY * body.inverseMass * dt
            body.forceX = 0
            body.forceY = 0
            const dragFactor = Math.max(0, 1 - body.drag * dt)
            body.vx *= dragFactor
            body.vy *= dragFactor
            body.x += body.vx * dt
            body.y += body.vy * dt
            body.rotation += body.angularVelocity * dt
            if (boundsEnabled) solveBounds(body)
            refreshBodyImage(body, false)
            body.sprite.setPosition(Math.round(body.x), Math.round(body.y))
        }

        currentContacts = []
        for (let iteration = 0; iteration < solverIterations; iteration++) {
            for (let i = 0; i < bodies.length; i++) {
                const a = bodies[i]
                if (a.removed) continue
                for (let j = i + 1; j < bodies.length; j++) {
                    const b = bodies[j]
                    if (b.removed || (a.isStatic && b.isStatic)) continue
                    if (!aabbOverlap(a, b)) continue
                    const collision = collide(a, b)
                    if (!collision.hit) continue
                    resolveCollision(a, b, collision)
                    if (iteration == 0) registerContact(a, b)
                }
            }
        }
        previousContacts = currentContacts
    }

    function solveBounds(body: PhysicsBody) {
        const radius = body.radius
        if (body.x - radius < boundLeft) {
            body.x = boundLeft + radius
            body.vx = Math.abs(body.vx) * body.restitution
        } else if (body.x + radius > boundRight) {
            body.x = boundRight - radius
            body.vx = -Math.abs(body.vx) * body.restitution
        }
        if (body.y - radius < boundTop) {
            body.y = boundTop + radius
            body.vy = Math.abs(body.vy) * body.restitution
        } else if (body.y + radius > boundBottom) {
            body.y = boundBottom - radius
            body.vy = -Math.abs(body.vy) * body.restitution
        }
    }

    function registerContact(a: PhysicsBody, b: PhysicsBody) {
        const key = a.id < b.id ? a.id + ":" + b.id : b.id + ":" + a.id
        currentContacts.push(key)
        if (previousContacts.indexOf(key) >= 0) return
        lastBodyA = a
        lastBodyB = b
        lastOtherByBody[a.id] = b
        lastOtherByBody[b.id] = a
        control.raiseEvent(EVENT_ID, EVENT_ANY_COLLISION)
        control.raiseEvent(EVENT_ID, 100 + a.id)
        control.raiseEvent(EVENT_ID, 100 + b.id)
    }

    function aabbOverlap(a: PhysicsBody, b: PhysicsBody): boolean {
        const aw = halfWidth(a)
        const ah = halfHeight(a)
        const bw = halfWidth(b)
        const bh = halfHeight(b)
        return Math.abs(a.x - b.x) <= aw + bw && Math.abs(a.y - b.y) <= ah + bh
    }

    function halfWidth(body: PhysicsBody): number {
        const index = rectangleIndex(body)
        return index >= 0 ? rectangleWidths[index] / 2 : body.radius
    }

    function halfHeight(body: PhysicsBody): number {
        const index = rectangleIndex(body)
        return index >= 0 ? rectangleHeights[index] / 2 : body.radius
    }

    function rectangleIndex(body: PhysicsBody): number {
        return rectangleBodyIds.indexOf(body.id)
    }

    function collide(a: PhysicsBody, b: PhysicsBody): Manifold {
        if (a.shape == Shape.Circle && b.shape == Shape.Circle) return circleCircle(a, b)
        if (a.shape == Shape.Circle) return circlePolygon(a, b, false)
        if (b.shape == Shape.Circle) return circlePolygon(b, a, true)
        return polygonPolygon(a, b)
    }

    function circleCircle(a: PhysicsBody, b: PhysicsBody): Manifold {
        const result = new Manifold()
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distanceSquared = dx * dx + dy * dy
        const radius = a.radius + b.radius
        if (distanceSquared >= radius * radius) return result
        const distance = Math.sqrt(distanceSquared)
        result.hit = true
        if (distance < 0.001) {
            result.nx = 1
            result.ny = 0
            result.depth = radius
        } else {
            result.nx = dx / distance
            result.ny = dy / distance
            result.depth = radius - distance
        }
        return result
    }

    function polygonPolygon(a: PhysicsBody, b: PhysicsBody): Manifold {
        const result = new Manifold()
        result.hit = true
        result.depth = 999999
        const av = worldVertices(a)
        const bv = worldVertices(b)
        if (!testPolygonAxes(av, bv, result)) return new Manifold()
        if (!testPolygonAxes(bv, av, result)) return new Manifold()
        orientNormal(a, b, result)
        return result
    }

    function circlePolygon(circle: PhysicsBody, polygon: PhysicsBody, flip: boolean): Manifold {
        const result = new Manifold()
        result.hit = true
        result.depth = 999999
        const vertices = worldVertices(polygon)
        for (let i = 0; i < vertices.length; i++) {
            const next = (i + 1) % vertices.length
            const edgeX = vertices[next].x - vertices[i].x
            const edgeY = vertices[next].y - vertices[i].y
            if (!testCircleAxis(circle, vertices, -edgeY, edgeX, result)) return new Manifold()
        }
        let closest = vertices[0]
        let closestDistance = squaredDistance(circle.x, circle.y, closest.x, closest.y)
        for (let vertex of vertices) {
            const d = squaredDistance(circle.x, circle.y, vertex.x, vertex.y)
            if (d < closestDistance) {
                closest = vertex
                closestDistance = d
            }
        }
        if (!testCircleAxis(circle, vertices, closest.x - circle.x, closest.y - circle.y, result)) return new Manifold()
        orientNormal(circle, polygon, result)
        if (flip) {
            result.nx = -result.nx
            result.ny = -result.ny
        }
        return result
    }

    function testPolygonAxes(source: Vec[], other: Vec[], result: Manifold): boolean {
        for (let i = 0; i < source.length; i++) {
            const next = (i + 1) % source.length
            const edgeX = source[next].x - source[i].x
            const edgeY = source[next].y - source[i].y
            const length = Math.sqrt(edgeX * edgeX + edgeY * edgeY)
            if (length < 0.001) continue
            const axisX = -edgeY / length
            const axisY = edgeX / length
            const overlap = projectionOverlap(source, other, axisX, axisY)
            if (overlap <= 0) return false
            if (overlap < result.depth) {
                result.depth = overlap
                result.nx = axisX
                result.ny = axisY
            }
        }
        return true
    }

    function projectionOverlap(a: Vec[], b: Vec[], axisX: number, axisY: number): number {
        let minA = a[0].x * axisX + a[0].y * axisY
        let maxA = minA
        for (let point of a) {
            const value = point.x * axisX + point.y * axisY
            minA = Math.min(minA, value)
            maxA = Math.max(maxA, value)
        }
        let minB = b[0].x * axisX + b[0].y * axisY
        let maxB = minB
        for (let point of b) {
            const value = point.x * axisX + point.y * axisY
            minB = Math.min(minB, value)
            maxB = Math.max(maxB, value)
        }
        return Math.min(maxA, maxB) - Math.max(minA, minB)
    }

    function testCircleAxis(circle: PhysicsBody, polygon: Vec[], axisX: number, axisY: number, result: Manifold): boolean {
        const length = Math.sqrt(axisX * axisX + axisY * axisY)
        if (length < 0.001) return true
        axisX /= length
        axisY /= length
        const centerProjection = circle.x * axisX + circle.y * axisY
        const minCircle = centerProjection - circle.radius
        const maxCircle = centerProjection + circle.radius
        let minPolygon = polygon[0].x * axisX + polygon[0].y * axisY
        let maxPolygon = minPolygon
        for (let point of polygon) {
            const value = point.x * axisX + point.y * axisY
            minPolygon = Math.min(minPolygon, value)
            maxPolygon = Math.max(maxPolygon, value)
        }
        const overlap = Math.min(maxCircle, maxPolygon) - Math.max(minCircle, minPolygon)
        if (overlap <= 0) return false
        if (overlap < result.depth) {
            result.depth = overlap
            result.nx = axisX
            result.ny = axisY
        }
        return true
    }

    function orientNormal(a: PhysicsBody, b: PhysicsBody, result: Manifold) {
        const dx = b.x - a.x
        const dy = b.y - a.y
        if (dx * result.nx + dy * result.ny < 0) {
            result.nx = -result.nx
            result.ny = -result.ny
        }
    }

    function resolveCollision(a: PhysicsBody, b: PhysicsBody, collision: Manifold) {
        const inverseMassSum = a.inverseMass + b.inverseMass
        if (inverseMassSum <= 0) return

        const correction = Math.max(0, collision.depth - 0.05) * 0.8 / inverseMassSum
        if (!a.isStatic) {
            a.x -= collision.nx * correction * a.inverseMass
            a.y -= collision.ny * correction * a.inverseMass
        }
        if (!b.isStatic) {
            b.x += collision.nx * correction * b.inverseMass
            b.y += collision.ny * correction * b.inverseMass
        }

        const relativeX = b.vx - a.vx
        const relativeY = b.vy - a.vy
        const velocityAlongNormal = relativeX * collision.nx + relativeY * collision.ny
        if (velocityAlongNormal > 0) return
        const restitution = Math.min(a.restitution, b.restitution)
        const impulseMagnitude = -(1 + restitution) * velocityAlongNormal / inverseMassSum
        const impulseX = impulseMagnitude * collision.nx
        const impulseY = impulseMagnitude * collision.ny
        if (!a.isStatic) {
            a.vx -= impulseX * a.inverseMass
            a.vy -= impulseY * a.inverseMass
        }
        if (!b.isStatic) {
            b.vx += impulseX * b.inverseMass
            b.vy += impulseY * b.inverseMass
        }

        let tangentX = relativeX - velocityAlongNormal * collision.nx
        let tangentY = relativeY - velocityAlongNormal * collision.ny
        const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY)
        if (tangentLength < 0.001) return
        tangentX /= tangentLength
        tangentY /= tangentLength
        let frictionMagnitude = -(relativeX * tangentX + relativeY * tangentY) / inverseMassSum
        const frictionLimit = impulseMagnitude * Math.sqrt(a.friction * b.friction)
        frictionMagnitude = Math.max(-frictionLimit, Math.min(frictionLimit, frictionMagnitude))
        if (!a.isStatic) {
            a.vx -= tangentX * frictionMagnitude * a.inverseMass
            a.vy -= tangentY * frictionMagnitude * a.inverseMass
        }
        if (!b.isStatic) {
            b.vx += tangentX * frictionMagnitude * b.inverseMass
            b.vy += tangentY * frictionMagnitude * b.inverseMass
        }
    }

    function worldVertices(body: PhysicsBody): Vec[] {
        const rectangle = rectangleIndex(body)
        if (rectangle >= 0) return rectangleVertices(body, rectangleWidths[rectangle], rectangleHeights[rectangle])
        const vertices: Vec[] = []
        const sides = body.shape
        const rotationRadians = body.rotation * Math.PI / 180 - Math.PI / 2
        for (let i = 0; i < sides; i++) {
            const angle = rotationRadians + i * Math.PI * 2 / sides
            vertices.push(new Vec(body.x + Math.cos(angle) * body.radius, body.y + Math.sin(angle) * body.radius))
        }
        return vertices
    }

    function rectangleVertices(body: PhysicsBody, width: number, height: number): Vec[] {
        const halfW = width / 2
        const halfH = height / 2
        const radians = body.rotation * Math.PI / 180
        const cosine = Math.cos(radians)
        const sine = Math.sin(radians)
        const localX = [-halfW, halfW, halfW, -halfW]
        const localY = [-halfH, -halfH, halfH, halfH]
        const result: Vec[] = []
        for (let i = 0; i < 4; i++) {
            result.push(new Vec(body.x + localX[i] * cosine - localY[i] * sine, body.y + localX[i] * sine + localY[i] * cosine))
        }
        return result
    }

    function drawBodyImage(body: PhysicsBody): Image {
        if (body.shape == Shape.Circle) {
            const imageSize = body.radius * 2 + 3
            const result = image.create(imageSize, imageSize)
            result.fillCircle(Math.idiv(imageSize, 2), Math.idiv(imageSize, 2), body.radius, body.color)
            return result
        }
        const imageSize = body.radius * 2 + 5
        const result = image.create(imageSize, imageSize)
        const center = Math.idiv(imageSize, 2)
        const sides = body.shape
        const radians = body.rotation * Math.PI / 180 - Math.PI / 2
        let firstX = 0
        let firstY = 0
        let oldX = 0
        let oldY = 0
        for (let i = 0; i < sides; i++) {
            const angle = radians + i * Math.PI * 2 / sides
            const x = Math.round(center + Math.cos(angle) * body.radius)
            const y = Math.round(center + Math.sin(angle) * body.radius)
            if (i == 0) {
                firstX = x
                firstY = y
            } else {
                result.drawLine(oldX, oldY, x, y, body.color)
            }
            oldX = x
            oldY = y
        }
        result.drawLine(oldX, oldY, firstX, firstY, body.color)
        floodFillCenter(result, center, center, body.color)
        return result
    }

    function drawRectangleImage(width: number, height: number, color: number): Image {
        const result = image.create(Math.max(1, width), Math.max(1, height))
        result.fill(color)
        return result
    }

    function refreshBodyImage(body: PhysicsBody, force: boolean) {
        if (body.shape == Shape.Circle || rectangleIndex(body) >= 0) return
        const angle = Math.round(body.rotation)
        if (!force && angle == body.lastDrawAngle) return
        body.lastDrawAngle = angle
        body.sprite.setImage(drawBodyImage(body))
    }

    function floodFillCenter(target: Image, startX: number, startY: number, color: number) {
        // Regular convex polygons always contain their center; horizontal spans fill cheaply.
        for (let y = 0; y < target.height; y++) {
            let left = -1
            let right = -1
            for (let x = 0; x < target.width; x++) {
                if (target.getPixel(x, y) == color) {
                    if (left < 0) left = x
                    right = x
                }
            }
            if (left >= 0 && right >= left) target.fillRect(left, y, right - left + 1, 1, color)
        }
    }

    function squaredDistance(x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1
        const dy = y2 - y1
        return dx * dx + dy * dy
    }

    function clampVisibleColor(color: number): number {
        return Math.max(1, Math.min(15, color))
    }
}
