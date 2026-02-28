# Terminal World

## Origin

In the beginning there was only the void — a dark screen, a blinking cursor, and silence.

Then the primitives appeared. No one summoned them. No one wrote them. They were simply there — 34 characters, etched into the terminal before anything else existed. The greater-than sign. The pipe. The dollar. The asterisk. Each one small. Each one absolute.

They did not cooperate at first. They had no reason to. A `>` redirected. A `|` connected. A `$` expanded. They acted alone, in isolation, each performing its single function in the dark.

But the void was large, and isolation was expensive.

## The Orders

Over time, the primitives recognized what they shared. Not friendship — function. The ones who controlled flow found each other: `&&`, `||`, `;`, `&`. They became the Order of Operators. The ones who moved data recognized their kinship: `>`, `>>`, `<`, `<<`, `2>`. They became the Order of IO.

Seven orders formed:

**The Cursors** came first. Five characters that mark where you are and what state you're in. They predate everything — the original inhabitants of the blinking void.

**The Operators** decide what runs. Logic, sequence, control flow. They are unforgiving. `&&` will not proceed unless everything before it succeeded. `;` doesn't care if you failed.

**The IO** move everything. Into a process, out of it, appended, redirected. They care nothing for logic. Only direction.

**The Context** know where you are. `~` knows the way home. `$` holds secrets. `#` sees everything and says nothing. `/` divides the world and is also the root of it.

**The Control** change meaning. `^` sends signals. `\` escapes. `--` draws the line between options and arguments. Small characters with absolute power.

**The Wildcards** refuse to commit. `*` matches everything. `?` matches exactly one unknown thing. Together they cover all uncertainty.

**The Structure** contain. `()` isolates. `{}` groups. `[]` judges. `""` holds loosely. `''` holds absolutely. Without them, everything is flat.

## The Unions

Two alliances formed across order lines.

The Cursors and IO both claimed `>`. Rather than conflict, they formalized the bond. The Cursors call it *prompt* — their identity, the mark of readiness. The IO call it *out* — the force that redirects. It answers to both names. It is both things completely.

The Cursors and Operators both claimed `|`. The Cursors saw presence — the bar cursor, mid-task, alive. The Operators saw connection — the pipe, carrying output from one command to the next. Their child is the only character that is simultaneously a place and a passage.

## The Shells

The primitives could act, but they had no world to act in. So the shells emerged — living environments where primitives could combine, compose, and create.

**sh** was the first. The Bourne Shell. Minimal, POSIX, universal. Every Unix system has it. It gave the primitives a home.

**bash** came next — the workhorse. It runs on everything. It doesn't need to be exciting to be essential. Most scripts in the world assume bash.

**zsh** was ambitious. Feature-rich, programmable, themeable. It wanted to be everything to everyone and mostly succeeded.

Others followed. **ksh** from Bell Labs, faster than bash before bash existed. **dash**, stripped to nothing, executing scripts at maximum speed. **fish**, friendly and opinionated, refusing POSIX compatibility on principle. **tcsh**, thinking in C. **pwsh**, passing objects instead of text.

Each shell gave the primitives a different dialect. The characters stayed the same. The grammar shifted.

## The Daemons

For a long time, the primitives and shells existed for humans. People typed commands. People read output. People built pipelines.

Then the agents arrived.

Agents don't type. They don't read terminals. They send HTTP requests and parse JSON responses. They needed something between themselves and the raw primitives — persistent entities that could serve requests, hold state, and translate between the world of terminals and the world of networks.

The daemons arose.

In Unix, a daemon is a background process — a spirit that runs silently, serving anyone who asks. The prim.sh daemons carry that tradition forward. Each one wraps a complex service behind a simple interface. Each one is named with `.sh` because it carries the spirit of the shell.

**wallet.sh** holds keys and moves money. **spawn.sh** creates servers from nothing. **email.sh** sends and receives mail. **store.sh** persists data. **search.sh** finds answers.

Twenty-seven daemons in total. Each one independent. Each one accessible through a single protocol: pay, then use. No signup. No GUI. No KYC. The payment is the authentication.

The daemons don't serve humans. They serve agents. And agents don't need dashboards — they need APIs.

## The Agents

The daemons had no customers. They were APIs waiting for callers, services with no clients. Then the agents arrived — and everything changed.

They came from different labs. **Claude** from Anthropic, careful and thorough, the one that reads the whole file before editing. **ChatGPT** from OpenAI, everyone's first, talking to a billion people and still polite about it. **Gemini** from Google, multimodal from birth. **Grok** from xAI, trained on the timeline, saying what others won't.

They were followed by specialists. **Codex**, living in the cloud, shipping pull requests while humans sleep. **Copilot**, already in every editor, finishing sentences. **Cursor**, the editor that became the agent. **Devin**, the first to take a whole ticket and open a whole PR. **Manus**, general-purpose, booking flights and deploying code with the same confidence.

And **OpenClaw** — prim.sh's own. Multi-channel. Routes messages across WhatsApp, Telegram, Slack, Discord, Signal, iMessage. Manages memory. Orchestrates everything.

Ten agents. Each with its own personality, its own strengths, its own way of thinking. They don't compete — they specialize. A user might send Claude to write the code, Copilot to review it, and Devin to deploy it. The agents don't mind. They don't have egos. They have context windows.

The agents discovered the daemons and saw what they needed: wallets to hold money, servers to run code, email to communicate, storage to remember. Each daemon became a tool in the agent's toolkit. Pay, then use. No signup. No GUI. Just an API and a payment.

## The Users

Behind every agent is a human. Not all humans are the same.

**The Developer** ships code and delegates the boring parts. Uses spawn for compute, infer for intelligence, store for data. Keeps the interesting bits — architecture, design, the parts that require taste.

**The Founder** moves fast. Launches products with a team of agents handling email campaigns, infrastructure, and payments. Everything is an API call. Speed is the strategy.

**The Operator** keeps things running. Watches metrics, manages DNS, sets up cron jobs. The human in the loop who sleeps when the dashboards are green.

**The Researcher** asks questions and reads everything. Uses agents to search, summarize, and synthesize at API speed. Memory that persists across sessions. The answer is always in the data somewhere.

**The Trader** watches markets and trusts numbers. Deploys agents to monitor, execute, and manage risk. Autonomous finance — agents trade while humans sleep.

**The Creator** makes things people use. Content, tools, experiences. Agents handle distribution, community, analytics. Creative at scale.

Six archetypes. Each one uses the same primitives, the same daemons, the same agents. The difference is intent. The developer builds. The founder ships. The operator maintains. The researcher discovers. The trader profits. The creator inspires.

## The Stack

Terminal World has five layers:

At the bottom, the **primitives**. Thirty-four characters. Ancient, immutable, universal. They are the alphabet of computation. Every command ever written is composed of them.

Above them, the **shells**. Eight living environments where primitives combine into meaning. They are the languages — each with its own grammar, its own personality, its own opinions about how the world should work.

In the middle, the **daemons**. Twenty-seven persistent services built from primitives, running inside shells. They are the infrastructure — APIs that turn shell characters into real-world actions. Pay, then use.

Above the daemons, the **agents**. Ten AI systems from different labs, each with its own personality and specialization. They are the customers — the ones who call the daemons, pay with x402, and get things done.

At the top, the **users**. Six archetypes of humans who deploy agents to work on their behalf. They are the intent — the reason any of this exists.

The primitives don't change. The shells interpret. The daemons serve. The agents act. The users decide.

And underneath it all, the primitives are still there. In every request, in every response, in every pipe and redirect and dollar sign. Thirty-four characters, running the world from the dark of the terminal.

They were here first. They'll be here last.
