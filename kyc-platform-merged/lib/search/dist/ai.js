"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.aiSearch = void 0;
/**
 * AI Search — retrieval-first via MongoDB text search, then OpenAI synthesis.
 * Never hallucinates: if evidence is insufficient, returns a clear fallback message.
 */
var standard_1 = require("./standard");
var OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
function truncate(str, max) {
    return str.length <= max ? str : str.slice(0, max) + '…';
}
function aiSearch(query) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, Promise, function () {
        var results, top, context, systemPrompt, userPrompt, answer, confidence, response, data, insufficientSignals, err_1;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (!OPENAI_API_KEY) {
                        return [2 /*return*/, {
                                answer: 'AI search is not configured (missing OPENAI_API_KEY).',
                                sources: [],
                                snippets: [],
                                confidence: 'insufficient',
                                query: query
                            }];
                    }
                    return [4 /*yield*/, standard_1.standardSearch(query, {})];
                case 1:
                    results = _e.sent();
                    top = results.slice(0, 6);
                    if (top.length === 0) {
                        return [2 /*return*/, {
                                answer: 'No relevant content found for your query in our knowledge base.',
                                sources: [],
                                snippets: [],
                                confidence: 'insufficient',
                                query: query
                            }];
                    }
                    context = top.map(function (r, i) {
                        var post = r.post;
                        return "[Source " + (i + 1) + "] \"" + post.title + "\" (" + post.category + ", " + new Date(post.published_at || post.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) + ")\n" + truncate(post.body, 800);
                    }).join('\n\n---\n\n');
                    systemPrompt = "You are a factual commodity intelligence analyst for the KYC (Know Your Commodity) platform.\nAnswer questions ONLY using the provided source documents. Do not invent facts.\nBe concise (2-4 sentences). Cite sources by their number [Source N].\nIf the documents don't have enough evidence to answer confidently, say: \"The available evidence is insufficient to answer this question confidently.\" followed by what you did find.\nDo not speculate beyond the provided text.";
                    userPrompt = "Question: " + query + "\n\nSource documents:\n" + context + "\n\nAnswer based only on the above sources:";
                    answer = '';
                    confidence = 'medium';
                    _e.label = 2;
                case 2:
                    _e.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, fetch('https://api.openai.com/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: "Bearer " + OPENAI_API_KEY
                            },
                            body: JSON.stringify({
                                model: 'gpt-4o-mini',
                                messages: [
                                    { role: 'system', content: systemPrompt },
                                    { role: 'user', content: userPrompt },
                                ],
                                max_tokens: 400,
                                temperature: 0.2
                            })
                        })];
                case 3:
                    response = _e.sent();
                    if (!response.ok) {
                        throw new Error("OpenAI error: " + response.status);
                    }
                    return [4 /*yield*/, response.json()];
                case 4:
                    data = _e.sent();
                    answer = ((_d = (_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim()) || '';
                    insufficientSignals = ['insufficient', 'not enough', 'cannot answer', 'don\'t have'];
                    if (insufficientSignals.some(function (s) { return answer.toLowerCase().includes(s); })) {
                        confidence = top.length >= 3 ? 'low' : 'insufficient';
                    }
                    else if (top.length >= 4 && top[0].score > 1) {
                        confidence = 'high';
                    }
                    else {
                        confidence = 'medium';
                    }
                    return [3 /*break*/, 6];
                case 5:
                    err_1 = _e.sent();
                    answer = "Error generating AI summary: " + (err_1 instanceof Error ? err_1.message : 'unknown error') + ". Here are the most relevant articles:";
                    confidence = 'insufficient';
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/, {
                        answer: answer,
                        sources: top.map(function (r) { return ({
                            slug: r.post.slug,
                            title: r.post.title,
                            excerpt: r.post.excerpt,
                            is_premium: r.post.is_premium
                        }); }),
                        snippets: top.map(function (r) { return r.snippet; }),
                        confidence: confidence,
                        query: query
                    }];
            }
        });
    });
}
exports.aiSearch = aiSearch;
