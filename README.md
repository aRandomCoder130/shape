# arcade-shape-physics

A lightweight, block-friendly rigid-body physics extension for Microsoft MakeCode Arcade.

## Features

- Circles
- Triangles
- Squares
- Pentagons
- Hexagons
- Static rectangular platforms
- Dynamic and static bodies
- Gravity, forces, impulses, velocity, and drag
- Mass, bounciness, and friction
- Rotation and angular velocity for regular polygons
- Circle–circle, circle–polygon, and polygon–polygon collisions
- Convex Separating Axis Theorem collision detection
- Impulse-based collision response and positional correction
- Solid configurable world bounds
- Global and per-body collision-begin events
- Sprite access for effects, camera work, and game integration

## Quick start

```blocks
shapePhysics.setGravity(0, 100)
let floor = shapePhysics.createPlatform(80, 112, 150, 8, 1)
let ball = shapePhysics.createCircle(50, 20, 7, 8)
let triangle = shapePhysics.createPolygon(shapePhysics.Shape.Triangle, 80, 20, 9, 5)
let hexagon = shapePhysics.createPolygon(shapePhysics.Shape.Hexagon, 110, 20, 10, 7)
shapePhysics.setBounciness(ball, 70)
shapePhysics.setAngularVelocity(hexagon, 90)
```

The `size` of a polygon is the distance from its center to each corner. A square with size 10 is therefore wider than 10 pixels.

## Forces and impulses

Velocity is measured in pixels per second:

```blocks
shapePhysics.setVelocity(ball, 40, 0)
```

A force accelerates a body during the current frame:

```blocks
shapePhysics.applyForce(ball, 0, -200)
```

An impulse changes velocity immediately and is useful for jumps, explosions, bumpers, and launches:

```blocks
shapePhysics.applyImpulse(ball, 25, -45)
```

## Materials

```blocks
shapePhysics.setMass(ball, 2)
shapePhysics.setBounciness(ball, 80)
shapePhysics.setFriction(ball, 20)
shapePhysics.setDrag(ball, 2)
```

- **Mass** controls how strongly impulses and collisions move a body.
- **Bounciness** controls restitution. `0` does not bounce; `100` is highly elastic.
- **Friction** slows sliding at contact surfaces.
- **Drag** gradually reduces motion through the air.

## Collision events

```blocks
shapePhysics.onBodyCollision(ball, function () {
    let other = shapePhysics.otherBody(ball)
    ball.sprite.startEffect(effects.spray, 100)
})
```

`on physics collision` runs whenever any new pair begins touching. Use `collision body A` and `collision body B` to inspect the pair.

Events are collision-begin events: resting bodies do not fire the event every frame.

## World controls

The default world bounds are the Arcade screen (`0,0` through `159,119`) and gravity is `(0,100)`.

```blocks
shapePhysics.setWorldBounds(4, 4, 155, 115)
shapePhysics.enableWorldBounds(true)
shapePhysics.setSolverIterations(3)
```

Two solver iterations are the default. Increase this for more stable stacks; reduce it for games with many moving bodies.

## Performance guidance

This is deliberately a small convex-body engine rather than a complete desktop physics library.

- Aim for roughly 15–30 active bodies on hardware.
- Use static platforms for floors and walls.
- Keep polygons convex.
- Disable unnecessary rotation by leaving angular velocity at zero.
- Two solver iterations are generally enough for arcade games.
- Very fast, tiny bodies can tunnel through thin objects because continuous collision detection is not included in v0.1.

## Import into Arcade

1. Put these files in a public GitHub repository.
2. Open a project in [MakeCode Arcade](https://arcade.makecode.com/).
3. Choose **Extensions**, paste the exact repository URL, and import it.

For releases, tag versions using semantic versioning, such as `v0.1.0`.

## License

MIT
