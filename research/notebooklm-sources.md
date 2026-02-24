# AI Agent Ecosystem — Sources

Exported from NotebookLM source spreadsheet.

## Table 1

| Entity or Protocol Name | Primary Function | Agent Type Coverage | Key Components | Target Platform or Ecosystem | Monetization and Trust Mechanism | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Model Context Protocol (MCP) | Communication Protocol / Tool Invocation Standard | Conversational, Proactive, Ambient, Autonomous, and Collaborative agents | MCP Server, MCP Client, Host, SDKs (Python/TypeScript), JSON schemas, and FastMCP package | Model-agnostic, Multi-platform (Claude Desktop, IDEs like Cursor, GitHub, Slack, Google Drive, and Enterprise CRM) | Capability scoping, OAuth/JWT tokens, role-based access, and human-in-the-loop approvals | 1-7 |
| Agent-to-Agent (A2A) Protocol | Communication Protocol / Coordination | Multi-vendor agent swarms and AI agent swarms | Agent Cards (JSON-based capability manifests), Agent Registry, Platform Events, A2A Client/Server, and SSE streaming | Salesforce Agentforce, Azure AI Foundry, and cross-domain agent ecosystems | Decentralized identifiers (DIDs), blockchain-anchored ledgers, and authentication via Public Agent Cards | 1, 4, 5, 8-10 |
| x402 Protocol | Payment Layer / Standard | High-frequency, tool-heavy autonomous agents and machine-to-machine commerce | HTTP 402 status code, PAYMENT-REQUIRED/SIGNATURE Headers, X-PAYMENT header, and EIP-3009 authorizations | Solana, Base (L2), Coinbase, Cloudflare, and general internet-native web services | Programmatic per-request micro-transactions via stablecoins (USDC) and facilitator verification of on-chain finality | 4, 11-15 |
| ERC-8004 | Regulatory / Trust Standard | Autonomous AI Agents | Identity Registry (ERC-721), Reputation Registry, and Validation Registry | Ethereum / EVM (Base, Polygon, Arbitrum) | Compliance signaling, on-chain reputation scores, staked validation, TEE attestations, and re-execution traces | 1, 4, 10, 12, 16 |
| Salesforce Agentforce | Platform Solution / Orchestration | Enterprise-grade conversational, proactive, ambient, autonomous, and collaborative agents | Agentforce Builder, Prompt Templates, Flow and Apex tools, MuleSoft, and Einstein Trust Layer | Salesforce CRM, Slack, and external integrations | Managed enterprise trust framework, Einstein Trust Layer (secure data masking), and consumption-based usage via Digital Wallet | 1, 8, 17 |
| Decentralized Identifiers (DIDs) | Trust and Identity Framework | People, organizations, AI agents, and IoT devices | DID Syntax, DID Document (JSON-LD), DID Methods, DID Controller, and Public/Private keys | W3C standard (distributed ledgers, P2P networks, and web services) | Cryptographic proofs (digital signatures) and decoupling from centralized identity providers | 4, 18, 19 |
| Agent Payments Protocol (AP2) | Payment Layer | Autonomous agents and transactional human-led agents | Intent Mandates, Cart Mandates, Payment Mandates, and Verifiable Credentials (VCs) | Google Cloud, Adyen, Mastercard, PayPal, and multi-network payments (cards, stablecoins) | Cryptographically-signed digital contracts (Mandates) and non-repudiable audit trails | 4, 20 |
| ERC-4337 | Trust Framework / Account Abstraction | On-chain autonomous agents | EntryPoint contract, UserOperation, Bundlers, and Paymasters | Ethereum / EVM | Programmable on-chain validation, session keys, and gas sponsorship | 1 |
| Coinbase AgentKit | Platform Solution / SDK | AI Agents with on-chain capabilities | Custom SDK, MPC custody, and CDP primitives | Multi-chain (EVM, Base) | MPC/Delegated custody and policy-scoped actions | 1 |
| Safe{Wallet} | Trust Framework / Custody | High-value autonomous agents | Safe Core, Zodiac Roles modifier, modules, and guards | EVM | On-chain threshold signatures and programmable permission modules | 1 |
| Turnkey | Payment Layer / Key Management | Enterprise-grade autonomous agents | Trusted Execution Environments (TEE), Secure Enclave, and REST API | Multi-chain | Policy-gated hardware-isolated signing | 1 |
| Lit Protocol | Trust Framework / Key Management | Cross-chain autonomous agents | Distributed Threshold Network and SDK | Multi-chain / Blockchain-agnostic | Condition-based signing and crypto-economic incentives | 1 |
| Universal Tool Calling Protocol (UTCP) | Communication Protocol | LLM Agents | Native API exposure and capability negotiation schemas | Tool provider agnostic | Verifiable outputs for high-stakes automation | 1 |
| BlockA2A | Trust Framework | Multi-agent systems (MAS) | Defense Orchestration Engine (DOE), DIDs, and Smart Contracts | Enterprise LLM-based MAS | DID authentication and blockchain-anchored ledgers | 1 |
| ACP (Agent Communication Protocol) | Communication Protocol | Enterprise multi-agent networks | RESTful HTTP interfaces, metadata registries, and capability-based security tokens | Linux Foundation, IBM, and cross-cloud | Capability-based security tokens for fine-grained authorization | 5 |
| ANP (Agent Network Protocol) | Communication Protocol | Decentralized agent networks | DID (W3C), JSON-LD, and HTTP/2 | Web-based Agent (did:wba) | Decentralized identity authentication and ECDHE encryption | 21, 22 |
| AGP (Agent Gateway Protocol) | Communication Protocol | Distributed agent mesh | gRPC, Protocol Buffers, and HTTP/2 | Cloud and Edge deployments | mTLS, RBAC, and end-to-end encryption | 5 |
| TAP (Tool Abstraction Protocol) | Communication Protocol / Tooling | Modular agent frameworks | JSON schema for tools and programmable authorities | Community-driven open standards | Permissioned execution / programmable authorities | 5 |

## Source References

| Index | Reference |
| --- | --- |
| 1 | Autonomous Agents on Blockchains: Standards, Execution Models, and Trust Boundaries |
| 2 | A Deep Dive Into MCP and the Future of AI Tooling / Andreessen ... |
| 3 | Model Context Protocol (MCP) - A Deep Dive - WWT |
| 4 | The Agentic Web and the Structural Evolution of the Machine-to-Machine Economy: An Architectural and Financial Deconstruction |
| 5 | AI Agent Protocols: 10 Modern Standards Shaping the Agentic Era - SSON |
| 6 | Building effective AI agents with Model Context Protocol (MCP) - Red Hat Developer |
| 7 | How the Model Context Protocol (MCP) Works - Lucidworks |
| 8 | Agentic Patterns and Implementation with Agentforce - Architects / Salesforce |
| 9 | Explainer: How will AI Agents pay each other using the x402 payments protocol |
| 10 | What is ERC-8004? The Ethereum Standard Enabling Trustless AI Agents - Eco |
| 11 | x402: Powering the Payment Layer for AI Agents - Shinkai Blog |
| 12 | ERC-8004 and x402: Infrastructure for Autonomous AI Agents / SmartContracts Tools |
| 13 | Activating HTTP 402: The x402 Protocol and Legal Framework for Internet-Native Stablecoin Payments - Braumiller Law Group |
| 14 | Coinbase Unveils 'Agentic Wallets' to Power Autonomous AI Agents / Financial IT |
| 15 | Welcome to x402 - Coinbase Developer Documentation |
| 16 | ERC-8004: The Universal Trust Protocol Powering AI Agent Commerce - OnFinality Blog |
| 17 | The Agentic AI Infrastructure Gap: Everyone's Building Agents. Nobody's Building the Substrate. - Distributed Thoughts |
| 18 | Decentralized Identifiers (DIDs) v1.0 - W3C |
| 19 | Decentralized Identifiers - Phil Windley's Technometria |
| 20 | Announcing Agent Payments Protocol (AP2) / Google Cloud Blog |
| 21 | ANP Technical White Paper – Agent Network Protocol（ANP） |
| 22 | What Are AI Agent Protocols? - IBM |

