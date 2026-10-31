# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Game masters and players preparing and playing tabletop role-playing campaigns together.

## Product Purpose

Make a Move keeps scenes, maps, tokens, characters, moves, dice rolls, notes, and conversation together in a shared virtual tabletop.

## Positioning

A local-first, peer-to-peer tabletop that runs as an installable PWA. Participants keep campaign data locally, work offline, and synchronize with connected peers.

## Operating Context

A GM creates a campaign and invites the group. Participants prepare and navigate scenes, manage characters, consult rules, roll actions, and communicate during play.

## Capabilities and Constraints

- Built-in Dungeon World and D&D 5.5e support; rules coverage and planned capabilities are documented in DESIGN.md.
- Campaign state uses Yjs and local persistence; peer connections synchronize shared state.
- General campaign data is not secret from peers. GM-only notes use a separate vault.
- Consequences such as damage and XP remain under player or GM control through explicit actions.
- The project is in active development; existing campaign formats may change.

## Brand Commitments

The name is Make a Move. Interface copy is succinct and functional. Preserve existing identity and licensed content attribution; visual specifications remain in DESIGN.md.

## Evidence on Hand

README.md describes the product and development workflow. DESIGN.md records capabilities, constraints, decisions, and visual requirements. The existing application supplies the incumbent implementation.

## Product Principles

- Keep the tabletop's related tools together.
- Preserve local ownership and offline operation.
- Use a generic core with game-system-specific rules.
- Keep consequential changes explicit and under the table's control.
