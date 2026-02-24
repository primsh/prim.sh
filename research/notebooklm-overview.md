The Open Agentic Web Stack: Architecture, Protocols, and Infrastructure

Executive Summary

The transition of the enterprise software landscape from direct manipulation to goal-oriented delegation is driven by the rise of agentic AI. This shift necessitates a new "agentic web stack"—a composition of services and protocols designed to make multi-agent ecosystems secure, scalable, and interoperable across organizational boundaries.

Current data suggests a significant "infrastructure gap": while nearly 83% of organizations have adopted AI agents, 50% of those agents operate in complete isolation, unable to share context or coordinate. The industry is currently moving from centralized compute models toward a distributed substrate that leverages standardized protocols like the Model Context Protocol (MCP) for tool integration, Agent-to-Agent (A2A) for communication, and x402 for native internet payments. Success in this new era depends on robust Information Architecture (IA) rather than just the deployment of individual agents.


--------------------------------------------------------------------------------


I. Taxonomy of AI Agents

To effectively design an agentic enterprise, organizations must categorize agents based on their primary mode of operation and interaction.

Agent Type	Definition	Strategic Importance
Conversational	Operates in a reactive, request-response manner via natural language (text/voice).	Acts as the "digital front door"; handles repetitive tasks and fetches info.
Proactive	Acts as a vigilant observer, triggered by specific events or data changes.	Transforms passive data repositories into active business participants.
Ambient	Operates continuously in the background to augment human capabilities.	Reduces cognitive load by automating "work about work" seamlessly.
Autonomous	Given high-level goals; independently plans and executes multi-step sequences.	Functionally equivalent to a "digital employee" for complex objectives.
Collaborative	Collections of specialized agents ("swarms") working under an orchestrator.	Mirages human teams; combines unique skills for robust solutions.


--------------------------------------------------------------------------------


II. The Agentic Web Stack: Essential Components

A robust agentic stack is not a single technology but a composition of services. Microsoft and other industry leaders identify several essential components:

1. Communication Protocol Service: Standardized "languages" such as MCP and A2A ensure agents can negotiate and cooperate regardless of their host or creator.
2. Discovery Registry Service: Includes Catalogs (listing of reusable assets) and Registries (tracking live agent instances and endpoints).
3. Identity and Trust Management: Employs standards like OIDC, JWT, and Decentralized Identifiers (DIDs). Trust is enforced through verifiable identities, enabling zero-trust security.
4. Tool Invocation and Integration: Standardized through MCP, allowing agents to connect with data and APIs without bespoke code for every tool.
5. Information Architecture (IA): The foundational semantic framework and data orchestration that allows for autonomous reasoning and explainable outcomes.
6. Reputation and Validation Registry: As defined by ERC-8004, this standardizes agent identity, feedback (scores), and independent validation of work results on-chain.


--------------------------------------------------------------------------------


III. Key Protocols for Interoperability

1. Model Context Protocol (MCP)

MCP is an open standard designed to solve the "API bottleneck." Instead of developers building custom integrations for every new tool, MCP provides a modular system for packaging tools.

* Structure: Follows a client-server architecture where the host (LLM application) connects to servers (representing a specific service like GitHub or a database).
* Components:
  * Tools: Functions that perform specific actions.
  * Resources: Data sources (files, databases) providing context to the LLM.
  * Prompts: Templates for repetitive tasks.

2. Agent-to-Agent (A2A) Protocol

The A2A protocol facilitates communication between agents. It allows an Orchestrator agent to discover "related agents" with specific capabilities (e.g., Billing, Logistics) and dispatch sub-tasks to them using a shared state and memory.

3. Decentralized Identifiers (DIDs)

DIDs are a foundational technology for self-sovereign identity.

* Properties: Non-reassignable, resolvable, and cryptographically verifiable.
* DID Documents: JSON-LD files describing public keys and service endpoints, allowing agents to maintain peer relationships without a central authority.


--------------------------------------------------------------------------------


IV. The Agentic Economy: Payments via x402

A major hurdle for autonomous agents is the inability to pay for services programmatically. The x402 protocol revives the long-dormant "HTTP 402: Payment Required" status code.

* Mechanism: When an agent requests a paid resource (e.g., a premium data API), the server responds with a 402 error and payment details. The agent automatically sends a payment (typically a cryptocurrency stablecoin) and proof of payment to retrieve the resource.
* Micropayment Model: x402 enables "pay-per-use" billing (fractions of a cent) that traditional credit card networks cannot economically handle.
* Blockchain Integration: Solana and other high-speed networks are being used as settlement layers due to low fees and near-instant finality.


--------------------------------------------------------------------------------


V. Strategic Implementation Patterns

1. External and Internal Event Response

Proactive agents are designed to respond to signals across systems.

* External: Responding to cart abandonment in an e-commerce system by triggering a Slack alert to an account manager and enrolling the customer in a discount journey.
* Internal: Monitoring CRM changes to ensure data hygiene or compliance (e.g., ensuring a primary contact is added before a deal stage progresses).

2. Ambient Stream Observation

Ambient agents attach themselves as observers to live data streams (e.g., video calls or chat threads).

* Real-Time Assistance: Detecting an objection during a sales call and proactively surfacing product specifications or handling instructions via a private message to the sales rep.

3. Agent Swarms and Brokers

In complex service escalations, an Agent Broker (or Orchestrator) decomposes a user's multi-faceted problem into tasks.

* Example: A single customer issue involving overbilling, incorrect shipping, and service disconnection is handled by specialized Billing, Logistics, and Provisioning agents whose findings are synthesized by the Orchestrator for human approval.


--------------------------------------------------------------------------------


VI. Critical Barriers and the "Substrate" Gap

Despite rapid adoption, the industry faces structural challenges:

* Isolating Silos: 50% of agents operate in isolation. 96% of organizations report barriers in using data for AI.
* The API Bottleneck: Most agents still rely on request-response APIs designed for centralized compute, which limits autonomy.
* The Infrastructure Gap: Current IT architecture is often outdated. Experts argue that agents require a distributed substrate—local-first context and peer coordination—rather than just "better integration middleware."
* Sovereignty vs. Coordination: Emerging trends (Sovereign AI, Edge AI, Agentic AI) are often on a collision course, as data sovereignty requirements may conflict with the need for agents to share context across boundaries.


--------------------------------------------------------------------------------


VII. Summary of Operational Requirements

Requirement	Description
Local-First Context	Agents must be able to make decisions based on local state without round-tripping to the cloud.
Peer Coordination	Discovery and trust must be established directly between agents to avoid centralized chokepoints.
Jurisdictional Awareness	Capability and data access must change based on the agent's physical/regulatory location.
Graceful Degradation	Agents must be able to operate with reduced capability when network connectivity is lost.
Observable Coordination	Distributed observability is needed to provide oversight of multi-agent decisions without central logging.
