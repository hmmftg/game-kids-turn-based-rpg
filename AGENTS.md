# AGENTS.md

## Purpose

This repository contains a child-oriented, turn-based RPG designed for young children.

AI coding agents working in this repository must prioritize:

1. **Child comprehension**
2. **Existing gameplay correctness**
3. **Accessibility and touch usability**
4. **RTL/Persian correctness**
5. **Performance and reliability**
6. **Maintainable architecture**
7. **Visual polish**

The product should feel like a:

> **guided interactive toy**

rather than a conventional, menu-heavy RPG.

The expected interaction model is:

```text
DISCOVER → APPROACH → WATCH → TRY → CELEBRATE → EXPLORE
```

---

# 1. Non-Negotiable Rules

## 1.1 Preserve gameplay/domain logic

AI agents must not modify gameplay semantics unless the task explicitly requires it.

Treat the following as protected:

* `src/domain/*`
* quest rules
* encounter rules
* progression rules
* reducer semantics
* save semantics
* persistence schema
* core game-state transitions

Do not alter gameplay merely to make UI implementation easier.

Prefer adapting the presentation layer to existing game state.

---

## 1.2 One source of truth

Do not create parallel representations of gameplay state.

Do not duplicate:

* quest state
* progression state
* encounter phase
* player progress
* sticker ownership
* save data

UI components must consume existing state.

UI-only ephemeral state is acceptable for things such as:

* animation visibility
* temporary hints
* transient celebration state
* pressed state
* local presentation transitions

Do not persist UI state unless explicitly required.

---

## 1.3 Do not modify persistence for cosmetic features

Do not change `PersistedState`, save schemas, migrations, or persistence formats merely to support:

* animations
* tutorials
* visual hints
* celebration state
* UI transitions

Prefer session/transient state.

Any persistence change requires explicit justification and corresponding migration/testing.

---

## 1.4 No unnecessary dependencies

Do not add a dependency when the existing stack can support the requirement.

Before adding a package:

1. inspect existing utilities/components
2. determine whether native APIs or existing dependencies suffice
3. verify the package is genuinely necessary

Avoid
