# Child Usability Validation Protocol (PR R)

**Status:** research protocol, not a feature. The engineering foundation is
mature; this phase gathers evidence on whether a 3–7-year-old can discover,
understand, and complete the core loop **without adult explanation**. No code
changes land as part of running this protocol — findings are classified and
only then decide PR S.

**Objective**

> Verify that children can discover, understand, and complete the core loop
> without adult explanation.

This is formative usability testing, not statistical research.

---

## 1. Participants

Two age bands, because the design carries different assumptions for each.

### Group A — 3–4 years

- Can they understand cause/effect?
- Can they identify what is tappable?
- Do they understand characters' intentions?

### Group B — 5–7 years

- Can they complete sequences?
- Can they infer goals?
- Can they replay independently?

| Group     |     Sessions |
| --------- | -----------: |
| 3–4 years | 3–5 children |
| 5–7 years | 3–5 children |

## 2. Test environment

Record for every session:

- device model
- screen size
- orientation (portrait / landscape)
- input method (touch / mouse)
- audio on/off
- reduced motion on/off

Example:

```
Device: iPad 10th gen
Mode:   portrait
Audio:  on
Child:  age 5
```

### Reproducible launch modes

The app already ships the modes this protocol needs — use URL flags so every
session is reproducible:

| Mode                 | How to launch                                                       |
| -------------------- | ------------------------------------------------------------------- |
| Standard             | `/`                                                                 |
| Copy-hidden (Mode B) | `/?kidtest=nocopy`                                                  |
| Full silent mode     | `/?kidtest=nocopy,noactionicons` + device muted + OS reduced motion |
| Reduced motion       | OS/browser "reduce motion" preference                               |

`nocopy` strips all rendered copy; `noactionicons` additionally strips every
non-physical affordance (physical state — the actually-held object — stays).
There is no audio flag: mute the device itself.

## 3. Rules for observers

**Do NOT teach.**

Do not say:

- "Tap the mouse."
- "Go to the fountain."
- "That's the wrong one."

Instead say:

- "What would you like to do?"

**Do not fix mistakes.** If the child gets stuck, observe:

- what they tried
- what they expected
- whether the game communicated failure

### Intervention ladder

Record the highest level used per task. Level 2+ is a finding, not a coaching
moment.

| Level | Action              |
| ----- | ------------------- |
| 0     | no help             |
| 1     | repeat question     |
| 2     | explain a game rule |
| 3     | physically point    |

## 4. Core tasks

Run tasks in order. Do not explain the game before Task 1.

### Task 1 — First discovery

Start:

> "Can you play with this?"

Observe: first tap location, hesitation time, exploration behavior.

Measure: **time to first meaningful interaction.**

### Task 2 — Navigation

Goal: reach a known location (e.g. the fountain).

Observe:

- does the child understand where the avatar will go?
- do they wait during movement?
- do they tap repeatedly?

Failures to note: tapping randomly, abandoning movement, asking the adult
where to go.

### Task 3 — NPC interaction

Goal: find and interact with a character.

Observe:

- recognition of friend/NPC
- whether the arrival reaction communicates "the character noticed me"
- whether they discover that the figure itself is tappable (arrival alone
  opens no dialogue — by design)

### Task 4 — Quest sequence

Do not explain the quest. A good first candidate is the bread errand (first
chapter, physically causal: find bread → carry → deliver).

Observe the chain:

```
discover → understand → perform action → recognize completion
```

The key question: **can they tell "something happened" without reading
text?** Watch for them tracking the object — the thing they tapped is the
thing that flies to its destination (PR M object identity).

### Task 5 — Battle (age 5+)

The playful mouse at the fountain.

Observe:

- do they understand the two choices (ball / cushion)?
- do they understand why they won or lost a round?
- do they retry?

## 5. Mode-B sessions

Kids must not need reading. After at least one standard session, run a second
session in each degraded mode.

### Copy-hidden

Launch `/?kidtest=nocopy`: dialogue text, quest descriptions, action labels
hidden — animation, character reactions, and world changes remain.

Question: **can the child continue?**

### Silent

Mute the device (music + SFX off). Optionally combine with
`nocopy,noactionicons` + reduced motion for the full silent pass.

Question: **is meaning preserved visually?**

## 6. Observation sheet

One sheet per session — see
[`usability-observation-sheet.md`](./usability-observation-sheet.md) for the
printable template.

| Moment        | Expected                | Observed | Severity |
| ------------- | ----------------------- | -------- | -------- |
| First tap     | child finds interaction |          |          |
| Walking       | understands destination |          |          |
| Quest start   | understands goal        |          |          |
| Object action | recognizes object       |          |          |
| Completion    | recognizes success      |          |          |

## 7. Metrics

Avoid vanity metrics (session length, quest count). Useful signals only.

### Independence

Per task:

- 0 = impossible
- 1 = completed with guidance (intervention level ≥ 2)
- 2 = completed independently

### Confusion moments (count)

- repeated taps at the same spot
- looking at the adult
- asking "what?"
- abandoning an action mid-way

### Delight signals (record — these matter more than completion)

- smiling
- talking to a character
- replaying an action
- showing the parent

## 8. Recording

Capture a few unedited 30–60 second clips (with appropriate consent). One
clip of a child hesitating at the cave entrance — or instantly understanding
the fountain fish — is worth more than pages of notes.

## 9. Classifying findings

After the sessions, classify each finding before any fix is scheduled.

### Fix immediately

- child never discovers the main action
- child thinks a character disappeared
- child cannot tell success happened

### Content issue

- quest wording confusing (fix copy, not mechanics)
- a character lacks personality

### Not a problem

- child explores differently but still succeeds — exploration diversity is
  the design working, not a defect

## 10. Decision outcomes (what PR R feeds)

Only after sessions does PR S get decided:

| Observation                           | → Direction                      |
| ------------------------------------- | -------------------------------- |
| Children struggle with navigation     | more world guidance              |
| Children understand but lose interest | more emotional/world content     |
| Children love the characters          | expand content                   |
| Children need reading                 | redesign the communication layer |

The worst outcome to engineer against prematurely is the last one — it means
the physical-vocabulary bet itself is wrong, and no amount of content fixes
that.
