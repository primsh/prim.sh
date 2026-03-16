// SPDX-License-Identifier: Apache-2.0
// THIS FILE IS GENERATED — DO NOT EDIT
// Source: packages/<id>/generated/openapi.yaml (all prims with rest interface)
// Regenerate: pnpm gen:sdk

export { unwrap, PrimError } from "../src/shared.js";
export { createPrimClient } from "../src/client.js";
export type { PrimClientConfig } from "../src/client.js";
export * from "./wallet.js";
export * from "./faucet.js";
export * from "./gate.js";
export * from "./store.js";
export * from "./search.js";
export * from "./spawn.js";
export { CreateMailboxRequest, DeleteDomainResponse, DeleteMailboxResponse, DeleteWebhookResponse, DnsRecord, EmailAddress, EmailDetail, GetDomainResponse, GetMailboxResponse, GetWebhookResponse, RegisterDomainRequest, RegisterWebhookRequest, RenewMailboxRequest, SendMessageRequest, SendMessageResponse, VerificationResult, VerifyDomainResponse, ListMailboxesParams, GetMailboxParams, DeleteMailboxParams, RenewMailboxParams, ListMessagesParams, GetMessageParams, SendMessageParams, RegisterWebhookParams, ListWebhooksParams, DeleteWebhookParams, ListDomainsParams, GetDomainParams, DeleteDomainParams, VerifyDomainParams, ListMailboxesResponse, ListMessagesResponse, ListWebhooksResponse, ListDomainsResponse, createEmailClient } from "./email.js";
export * from "./token.js";
export * from "./mem.js";
export { ActivateDomainResponse, BatchCreateEntry, BatchDeleteEntry, BatchRecordsRequest, BatchRecordsResponse, BatchUpdateEntry, CreateRecordRequest, CreateZoneRequest, CreateZoneResponse, DkimKey, DomainSearchPrice, DomainSearchResult, GetRecordResponse, GetRegistrationStatusResponse, GetZoneResponse, MailSetupRecordResult, NsVerifyResult, QuoteRequest, QuoteResponse, RecordVerifyResult, SearchDomainResponse, SetupMailRequest, SetupMailResponse, UpdateRecordRequest, SearchDomainParams, GetDomainStatusParams, ListZonesParams, GetZoneParams, DeleteZoneParams, ActivateZoneParams, VerifyZoneParams, SetupMailParams, BatchRecordsParams, CreateRecordParams, ListRecordsParams, GetRecordParams, UpdateRecordParams, DeleteRecordParams, ListZonesResponse, DeleteZoneResponse, ListRecordsResponse, DeleteRecordResponse, createDomainClient } from "./domain.js";
// Skipped from domain: VerifyDomainResponse (name collision)
export * from "./track.js";
export { ChatRequest, ChatResponse, Choice, ContentPart, EmbedRequest, EmbedResponse, EmbeddingData, ListModelsResponse, Message, ModelInfo, ModelPricing, Tool, ToolCall, Usage, createInferClient } from "./infer.js";
export * from "./create.js";
export { DescribeRequest, DescribeResponse, GenerateRequest, GenerateResponse, UpscaleRequest, UpscaleResponse, createImagineClient } from "./imagine.js";
// Skipped from imagine: ListModelsResponse (name collision)
