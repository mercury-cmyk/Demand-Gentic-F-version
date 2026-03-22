"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentChatInterface = AgentChatInterface;
var react_1 = require("react");
var framer_motion_1 = require("framer-motion");
var lucide_react_1 = require("lucide-react");
var button_1 = require("@/components/ui/button");
var textarea_1 = require("@/components/ui/textarea");
var scroll_area_1 = require("@/components/ui/scroll-area");
var collapsible_1 = require("@/components/ui/collapsible");
var utils_1 = require("@/lib/utils");
var use_toast_1 = require("@/hooks/use-toast");
var AgentPanelProvider_1 = require("./AgentPanelProvider");
var AgentPlanViewer_1 = require("./AgentPlanViewer");
var AgentQuickActions_1 = require("./AgentQuickActions");
var markdown_renderer_1 = require("@/components/ui/markdown-renderer");
function AgentChatInterface(_a) {
    var _this = this;
    var sessionId = _a.sessionId, conversationId = _a.conversationId, isClientPortal = _a.isClientPortal, userRole = _a.userRole;
    var toast = (0, use_toast_1.useToast)().toast;
    var _b = (0, AgentPanelProvider_1.useAgentPanelContext)(), setConversationId = _b.setConversationId, setAgentStatus = _b.setAgentStatus, enterOrderMode = _b.enterOrderMode;
    var _c = (0, react_1.useState)([]), messages = _c[0], setMessages = _c[1];
    var _d = (0, react_1.useState)(''), inputValue = _d[0], setInputValue = _d[1];
    var _e = (0, react_1.useState)(false), isLoading = _e[0], setIsLoading = _e[1];
    var _f = (0, react_1.useState)(null), currentPlan = _f[0], setCurrentPlan = _f[1];
    var _g = (0, react_1.useState)(false), isExecutingPlan = _g[0], setIsExecutingPlan = _g[1];
    var scrollRef = (0, react_1.useRef)(null);
    var inputRef = (0, react_1.useRef)(null);
    // Detect order intent from messages
    var detectOrderIntent = (0, react_1.useCallback)(function (message) {
        var orderKeywords = [
            'create a new campaign order',
            'new order',
            'place an order',
            'order campaign',
            'want to order',
            'need leads',
            'generate leads',
            'qualified leads',
            'appointment setting',
        ];
        return orderKeywords.some(function (keyword) {
            return message.toLowerCase().includes(keyword.toLowerCase());
        });
    }, []);
    // Check if user message triggers order mode
    (0, react_1.useEffect)(function () {
        var lastUserMessage = messages.findLast(function (m) { return m.role === 'user'; });
        if (lastUserMessage && detectOrderIntent(lastUserMessage.content) && isClientPortal) {
            enterOrderMode();
        }
    }, [messages, detectOrderIntent, enterOrderMode, isClientPortal]);
    (0, react_1.useEffect)(function () {
        if (isExecutingPlan) {
            setAgentStatus('executing');
            return;
        }
        if (isLoading) {
            setAgentStatus('thinking');
            return;
        }
        if (currentPlan) {
            setAgentStatus('awaiting_review');
            return;
        }
        setAgentStatus('idle');
    }, [currentPlan, isExecutingPlan, isLoading, setAgentStatus]);
    // Auto-scroll to bottom
    (0, react_1.useEffect)(function () {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);
    // Handle quick action events
    (0, react_1.useEffect)(function () {
        var handleQuickAction = function (e) {
            var _a;
            setInputValue(e.detail.prompt);
            (_a = inputRef.current) === null || _a === void 0 ? void 0 : _a.focus();
        };
        window.addEventListener('agent-quick-action', handleQuickAction);
        return function () {
            window.removeEventListener('agent-quick-action', handleQuickAction);
        };
    }, []);
    var getAuthToken = (0, react_1.useCallback)(function () {
        return localStorage.getItem(isClientPortal ? 'clientPortalToken' : 'authToken');
    }, [isClientPortal]);
    var sendMessage = (0, react_1.useCallback)(function () { return __awaiter(_this, void 0, void 0, function () {
        var userMessage, token, endpoint, requestBody, response, errorText, data, assistantMessage_1, error_1, errorMessage_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!inputValue.trim() || isLoading)
                        return [2 /*return*/];
                    userMessage = {
                        id: "msg-".concat(Date.now()),
                        role: 'user',
                        content: inputValue.trim(),
                        timestamp: new Date().toISOString(),
                    };
                    setMessages(function (prev) { return __spreadArray(__spreadArray([], prev, true), [userMessage], false); });
                    setInputValue('');
                    setIsLoading(true);
                    setCurrentPlan(null);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 6, 7, 8]);
                    token = getAuthToken();
                    if (!token) {
                        throw new Error('Authentication required. Please log in.');
                    }
                    endpoint = "/api/agent-panel/chat?clientPortal=".concat(isClientPortal);
                    requestBody = {
                        message: userMessage.content,
                        sessionId: sessionId,
                        conversationId: conversationId || undefined,
                        planMode: true,
                    };
                    return [4 /*yield*/, fetch(endpoint, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: "Bearer ".concat(token),
                            },
                            body: JSON.stringify(requestBody),
                        })];
                case 2:
                    response = _b.sent();
                    if (!!response.ok) return [3 /*break*/, 4];
                    return [4 /*yield*/, response.text()];
                case 3:
                    errorText = _b.sent();
                    console.error('Server error response:', errorText);
                    throw new Error("Server Error: ".concat(response.status, " ").concat(response.statusText, " - ").concat(errorText));
                case 4: return [4 /*yield*/, response.json()];
                case 5:
                    data = _b.sent();
                    if (data.conversationId && data.conversationId !== conversationId) {
                        setConversationId(data.conversationId);
                    }
                    assistantMessage_1 = __assign(__assign({}, data.message), { timestamp: ((_a = data.message) === null || _a === void 0 ? void 0 : _a.timestamp) || new Date().toISOString() });
                    setMessages(function (prev) { return __spreadArray(__spreadArray([], prev, true), [assistantMessage_1], false); });
                    if (data.plan) {
                        setCurrentPlan(data.plan);
                    }
                    return [3 /*break*/, 8];
                case 6:
                    error_1 = _b.sent();
                    console.error('Error sending message:', error_1);
                    errorMessage_1 = {
                        id: "msg-".concat(Date.now()),
                        role: 'assistant',
                        content: "Sorry, I encountered an error. ".concat(error_1.message),
                        timestamp: new Date().toISOString(),
                    };
                    setMessages(function (prev) { return __spreadArray(__spreadArray([], prev, true), [errorMessage_1], false); });
                    return [3 /*break*/, 8];
                case 7:
                    setIsLoading(false);
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    }); }, [conversationId, getAuthToken, inputValue, isClientPortal, isLoading, sessionId, setConversationId]);
    var handleKeyDown = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
    var handlePlanApprove = function (planId) { return __awaiter(_this, void 0, void 0, function () {
        var token, response, data, stepCount, resultMessage_1, error_2;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    setIsExecutingPlan(true);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 4, 5, 6]);
                    token = getAuthToken();
                    return [4 /*yield*/, fetch("/api/agent-panel/execute/".concat(planId), {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: "Bearer ".concat(token),
                            },
                            body: JSON.stringify({}),
                        })];
                case 2:
                    response = _c.sent();
                    if (!response.ok) {
                        throw new Error('Failed to execute plan');
                    }
                    return [4 /*yield*/, response.json()];
                case 3:
                    data = _c.sent();
                    stepCount = ((_a = data.executedSteps) === null || _a === void 0 ? void 0 : _a.length) || 0;
                    resultMessage_1 = {
                        id: "msg-".concat(Date.now()),
                        role: 'assistant',
                        content: "Plan executed successfully. ".concat(stepCount, " step").concat(stepCount !== 1 ? 's' : '', " completed."),
                        timestamp: new Date().toISOString(),
                        toolsExecuted: (_b = data.executedSteps) === null || _b === void 0 ? void 0 : _b.map(function (s) {
                            var _a;
                            return ({
                                tool: ((_a = s.result) === null || _a === void 0 ? void 0 : _a.tool) || s.stepId,
                                args: {},
                                result: s.result,
                            });
                        }),
                    };
                    setMessages(function (prev) { return __spreadArray(__spreadArray([], prev, true), [resultMessage_1], false); });
                    setCurrentPlan(null);
                    return [3 /*break*/, 6];
                case 4:
                    error_2 = _c.sent();
                    console.error('Error executing plan:', error_2);
                    return [3 /*break*/, 6];
                case 5:
                    setIsExecutingPlan(false);
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    }); };
    var handlePlanReject = function (planId) { return __awaiter(_this, void 0, void 0, function () {
        var token, rejectMessage_1, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    token = getAuthToken();
                    return [4 /*yield*/, fetch("/api/agent-panel/reject/".concat(planId), {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: "Bearer ".concat(token),
                            },
                            body: JSON.stringify({ reason: 'User rejected the plan' }),
                        })];
                case 1:
                    _a.sent();
                    rejectMessage_1 = {
                        id: "msg-".concat(Date.now()),
                        role: 'assistant',
                        content: 'Plan cancelled. How else can I help you?',
                        timestamp: new Date().toISOString(),
                    };
                    setMessages(function (prev) { return __spreadArray(__spreadArray([], prev, true), [rejectMessage_1], false); });
                    setCurrentPlan(null);
                    return [3 /*break*/, 3];
                case 2:
                    error_3 = _a.sent();
                    console.error('Error rejecting plan:', error_3);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    return (<div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Ambient glowing orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/[0.03] rounded-full blur-[100px] -translate-y-1/2 pointer-events-none"/>
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-violet-500/[0.03] rounded-full blur-[100px] translate-y-1/3 pointer-events-none"/>
      
      {/* Messages Area */}
      <scroll_area_1.ScrollArea className="flex-1 px-4 relative z-10" ref={scrollRef}>
        <div className="py-4 space-y-5">
          {messages.length === 0 ? (<WelcomeMessage isClientPortal={isClientPortal} userRole={userRole} onEnterOrderMode={enterOrderMode}/>) : (<framer_motion_1.AnimatePresence mode="popLayout">
              {messages.map(function (message) { return (<MessageBubble key={message.id} message={message}/>); })}
            </framer_motion_1.AnimatePresence>)}

          {/* Current Plan */}
          {currentPlan && (<framer_motion_1.motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
              <AgentPlanViewer_1.AgentPlanViewer plan={currentPlan} onApprove={function () { return handlePlanApprove(currentPlan.id); }} onReject={function () { return handlePlanReject(currentPlan.id); }} isExecuting={isExecutingPlan}/>
            </framer_motion_1.motion.div>)}

          {/* Loading Indicator */}
          {isLoading && (<framer_motion_1.motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
              <TypingIndicator />
            </framer_motion_1.motion.div>)}
        </div>
      </scroll_area_1.ScrollArea>

      {/* ── Input Area ── */}
      <div className="border-t border-border/20 bg-background/60 backdrop-blur-3xl px-3 pb-3 pt-4 relative isolate">
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent -z-10"/>
        <div className="relative group max-w-[850px] mx-auto">
          <div className={(0, utils_1.cn)("absolute -inset-0.5 bg-gradient-to-r from-primary/40 via-violet-500/40 to-primary/40 rounded-2xl blur-md opacity-0 transition-opacity duration-500", inputValue.trim() && "opacity-40 group-focus-within:opacity-100", isLoading && "animate-pulse opacity-100 from-sky-400/40 to-sky-600/40")}/>
          <div className="relative flex items-end rounded-xl border border-border/40 bg-card/80 backdrop-blur-lg shadow-sm focus-within:border-primary/50 transition-all duration-300">
            <textarea_1.Textarea ref={inputRef} value={inputValue} onChange={function (e) { return setInputValue(e.target.value); }} onKeyDown={handleKeyDown} placeholder="Tell AgentC what you want done..." className="min-h-[44px] max-h-[160px] w-full resize-none border-0 shadow-none focus-visible:ring-0 py-3 pl-4 pr-12 bg-transparent text-sm leading-relaxed" rows={1}/>
            <div className="absolute right-2 bottom-2">
              <button_1.Button size="icon" onClick={sendMessage} disabled={!inputValue.trim() || isLoading} className={(0, utils_1.cn)('h-8 w-8 rounded-lg transition-all duration-300', inputValue.trim() && !isLoading
            ? 'bg-gradient-to-tr from-primary to-violet-500 hover:opacity-90 text-white shadow-lg shadow-primary/20 scale-100'
            : 'bg-muted/50 text-muted-foreground scale-95')}>
                {isLoading ? (<lucide_react_1.Loader2 className="h-4 w-4 animate-spin"/>) : (<lucide_react_1.Send className="h-4 w-4 translate-x-[-1px] translate-y-[1px]"/>)}
              </button_1.Button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-3">
          <AgentQuickActions_1.AgentQuickActions isClientPortal={isClientPortal} userRole={userRole}/>
        </div>

        <p className="text-[10px] text-muted-foreground/40 mt-3 text-center select-none tracking-wide">
          AgentC can make mistakes. Check important info.
        </p>
      </div>
    </div>);
}
// ── Typing Indicator ──
function TypingIndicator() {
    return (<div className="flex items-start gap-3 py-2">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 backdrop-blur-sm shadow-[0_0_12px_rgba(var(--primary),0.1)] relative">
        <lucide_react_1.Bot className="h-4 w-4 text-primary animate-pulse"/>
        <div className="absolute inset-0 rounded-full border border-primary/30 animate-[spin_3s_linear_infinite]" style={{ borderTopColor: 'transparent', borderRightColor: 'transparent' }}/>
      </div>
      <div className="flex flex-col gap-2 pt-1.5">
        <div className="flex items-center gap-1.5 bg-card/40 backdrop-blur-md px-3 py-2 rounded-2xl rounded-tl-sm border border-border/40 shadow-sm">
          {[0, 1, 2].map(function (i) { return (<framer_motion_1.motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-primary to-violet-500" animate={{ y: [0, -4, 0], scale: [0.8, 1.2, 0.8], opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}/>); })}
        </div>
        <span className="text-[10px] font-medium text-primary/60 px-1 tracking-widest uppercase">AgentC Processing</span>
      </div>
    </div>);
}
// ── Welcome Action Card ──
function WelcomeActionCard(_a) {
    var Icon = _a.icon, title = _a.title, description = _a.description, onClick = _a.onClick, primary = _a.primary;
    return (<button onClick={onClick} className={(0, utils_1.cn)('flex flex-col items-start gap-2.5 p-3.5 rounded-2xl border text-left transition-all duration-300 group relative overflow-hidden', primary
            ? 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 hover:border-primary/40 focus:ring-2 focus:ring-primary/20 backdrop-blur-md shadow-[0_8px_16px_-6px_rgba(var(--primary),0.1)] hover:shadow-[0_8px_24px_-6px_rgba(var(--primary),0.2)] hover:-translate-y-0.5'
            : 'bg-card/40 backdrop-blur-sm border-border/40 hover:bg-card/80 hover:border-border/80 hover:shadow-lg hover:-translate-y-0.5')}>
      <div className={(0, utils_1.cn)("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-500", primary ? "from-primary to-violet-500" : "from-foreground/5 to-transparent")}/>
      <div className={(0, utils_1.cn)('p-2 rounded-xl transition-all duration-300 relative z-10', primary
            ? 'bg-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground shadow-inner'
            : 'bg-muted text-muted-foreground group-hover:text-foreground group-hover:bg-background shadow-sm')}>
        <Icon className="h-4 w-4"/>
      </div>
      <div className="relative z-10">
        <p className={(0, utils_1.cn)('text-xs font-semibold tracking-tight', primary ? 'text-primary' : 'text-foreground/90')}>
          {title}
        </p>
        <p className="text-[10px] text-muted-foreground/80 mt-1 leading-relaxed line-clamp-2">{description}</p>
      </div>
    </button>);
}
// ── Welcome Message ──
function WelcomeMessage(_a) {
    var isClientPortal = _a.isClientPortal, userRole = _a.userRole, onEnterOrderMode = _a.onEnterOrderMode;
    var dispatchQuickAction = function (prompt) {
        window.dispatchEvent(new CustomEvent('agent-quick-action', { detail: { prompt: prompt } }));
    };
    return (<framer_motion_1.motion.div initial={{ opacity: 0, scale: 0.95, y: 20, filter: "blur(8px)" }} animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }} className="flex flex-col items-center justify-center py-10 px-4 space-y-6 select-none relative z-10">
      <framer_motion_1.motion.div className="relative group cursor-default" animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
        <div className="absolute -inset-4 bg-gradient-to-r from-primary/30 via-violet-500/30 to-fuchsia-500/30 rounded-full blur-2xl opacity-60 group-hover:opacity-100 group-hover:blur-3xl transition-all duration-700 animate-in fade-in"/>
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-card to-card/50 flex items-center justify-center border border-border/50 shadow-2xl backdrop-blur-xl">
          <lucide_react_1.Bot className="h-9 w-9 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]"/>
        </div>
        <div className="absolute -bottom-1.5 -right-1.5 bg-background p-1.5 rounded-full border border-border/50 shadow-lg">
          <lucide_react_1.Sparkles className="w-4 h-4 text-amber-500 fill-amber-500/20"/>
        </div>
      </framer_motion_1.motion.div>

      <div className="text-center space-y-2 max-w-xs">
        <h3 className="font-bold text-2xl tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/70">
          AgentC
        </h3>
        <p className="text-xs text-muted-foreground/80 leading-relaxed font-medium">
          Your autonomous AI assistant for campaigns, analytics, and operations.
        </p>
      </div>

      {/* Client Portal Action Cards */}
      {isClientPortal && (<div className="w-full grid grid-cols-2 gap-2.5 max-w-sm">
          <WelcomeActionCard icon={lucide_react_1.Rocket} title="New Campaign" description="Launch order" onClick={onEnterOrderMode} primary/>
          <WelcomeActionCard icon={lucide_react_1.BarChart3} title="Analysis" description="Performance review" onClick={function () { return dispatchQuickAction('Analyze the performance of my active campaigns'); }}/>
          <WelcomeActionCard icon={lucide_react_1.FileText} title="Reports" description="Summary report" onClick={function () { return dispatchQuickAction('Generate a weekly summary report'); }}/>
          <WelcomeActionCard icon={lucide_react_1.Target} title="Leads" description="Quality check" onClick={function () { return dispatchQuickAction('Check the quality of leads generated today'); }}/>
          <WelcomeActionCard icon={lucide_react_1.Search} title="Deep Research" description="Market & competitive" onClick={function () { return dispatchQuickAction('Deep research: analyze the competitive landscape and market trends for our industry'); }}/>
          <WelcomeActionCard icon={lucide_react_1.Code2} title="Code Assist" description="AI generation" onClick={function () { return dispatchQuickAction('Help me write code for a new API endpoint'); }}/>
        </div>)}

      {/* Admin Welcome */}
      {!isClientPortal && (<div className="w-full grid grid-cols-2 gap-2.5 max-w-sm">
          <WelcomeActionCard icon={lucide_react_1.Brain} title="System Check" description="Diagnostics" onClick={function () { return dispatchQuickAction('Run a full system diagnostic check'); }}/>
          <WelcomeActionCard icon={lucide_react_1.Building2} title="Org Intel" description="Account analysis" onClick={function () { return dispatchQuickAction('Analyze recently active accounts for intent'); }}/>
          <WelcomeActionCard icon={lucide_react_1.Search} title="Deep Research" description="Market intel" onClick={function () { return dispatchQuickAction('Deep research: comprehensive market analysis and industry trends'); }}/>
          <WelcomeActionCard icon={lucide_react_1.Code2} title="Code Assist" description="AI generation" onClick={function () { return dispatchQuickAction('Help me implement a new feature with code'); }}/>
        </div>)}
    </framer_motion_1.motion.div>);
}
// ── Message Bubble ──
function MessageBubble(_a) {
    var message = _a.message;
    var _b = (0, react_1.useState)(false), showDetails = _b[0], setShowDetails = _b[1];
    var _c = (0, react_1.useState)(false), copied = _c[0], setCopied = _c[1];
    var isUser = message.role === 'user';
    var hasExecutedSteps = !isUser && message.toolsExecuted && message.toolsExecuted.length > 0;
    var isSuccessMessage = !isUser && message.content.includes('Plan executed successfully');
    var copyContent = function () {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(function () { return setCopied(false); }, 2000);
    };
    return (<framer_motion_1.motion.div ref={ref} layout initial={{ opacity: 0, y: 15, scale: 0.95, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} className={(0, utils_1.cn)('group flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={(0, utils_1.cn)('w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10', isUser
            ? 'bg-gradient-to-tr from-primary to-primary/80 shadow-md shadow-primary/20'
            : 'bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20 backdrop-blur-sm')}>
        {isUser ? (<lucide_react_1.User className="h-3.5 w-3.5 text-primary-foreground"/>) : (<lucide_react_1.Bot className="h-3.5 w-3.5 text-primary"/>)}
      </div>

      {/* Content */}
      <div className={(0, utils_1.cn)('flex-1 max-w-[88%] space-y-1.5', isUser && 'flex flex-col items-end')}>
        {/* Sender */}
        <span className={(0, utils_1.cn)('text-[10px] font-medium text-muted-foreground/50 px-0.5 tracking-wider uppercase', isUser && 'text-right')}>
          {isUser ? 'You' : 'AgentC'}
        </span>

        {/* Bubble */}
        <div className={(0, utils_1.cn)('relative rounded-2xl px-4 py-3 text-sm leading-relaxed transition-all duration-300', isUser
            ? 'bg-gradient-to-br from-primary/95 to-primary text-primary-foreground rounded-tr-sm shadow-md shadow-primary/10'
            : isSuccessMessage
                ? 'bg-emerald-500/5 backdrop-blur-md border border-emerald-500/20 rounded-tl-sm text-foreground shadow-sm'
                : 'bg-card/60 backdrop-blur-lg border border-border/40 rounded-tl-sm text-foreground shadow-sm hover:shadow-md hover:border-border/60')}>
          {/* Success icon for plan completion */}
          {isSuccessMessage && (<div className="flex items-center gap-2 mb-2 pb-2 border-b border-emerald-200/60 dark:border-emerald-800/40">
              <lucide_react_1.CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400"/>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Execution Complete</span>
            </div>)}

          {isUser ? (<div className="whitespace-pre-wrap">{message.content}</div>) : (<markdown_renderer_1.MarkdownRenderer content={message.content}/>)}

          {/* Executed steps */}
          {hasExecutedSteps && (<div className="mt-3 pt-2 border-t border-border/30 space-y-1">
              {message.toolsExecuted.map(function (step, idx) {
                var _a, _b;
                var toolLabel = (((_a = step.result) === null || _a === void 0 ? void 0 : _a.message) || step.tool || "Step ".concat(idx + 1))
                    .replace(/^Executed\s+/, '')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
                return (<div key={idx} className="flex items-center gap-2 text-xs">
                    <lucide_react_1.CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0"/>
                    <span className="font-medium text-foreground/80">{toolLabel}</span>
                    {((_b = step.result) === null || _b === void 0 ? void 0 : _b.success) && (<span className="text-emerald-600/70 text-[10px]">Done</span>)}
                  </div>);
            })}
            </div>)}

          {/* Copy button on hover */}
          {!isUser && (<button onClick={copyContent} className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border/60 rounded-md p-1 shadow-sm hover:bg-muted">
              {copied ? (<lucide_react_1.Check className="h-3 w-3 text-emerald-500"/>) : (<lucide_react_1.Copy className="h-3 w-3 text-muted-foreground"/>)}
            </button>)}
        </div>

        {/* Thought Process */}
        {message.thoughtProcess && message.thoughtProcess.length > 0 && (<div className="w-full max-w-[92%]">
            <collapsible_1.Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <collapsible_1.CollapsibleTrigger asChild>
                <button_1.Button variant="ghost" size="sm" className="w-full flex items-center justify-between px-3 h-7 text-[11px] font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-1.5">
                    <lucide_react_1.Brain className="h-3 w-3"/>
                    <span>View Reasoning ({message.thoughtProcess.length} steps)</span>
                  </div>
                  <lucide_react_1.ChevronDown className={(0, utils_1.cn)('h-3 w-3 transition-transform duration-200', showDetails && 'rotate-180')}/>
                </button_1.Button>
              </collapsible_1.CollapsibleTrigger>
              <collapsible_1.CollapsibleContent>
                <div className="mt-1 p-3 bg-muted/30 rounded-lg border border-border/30 space-y-2">
                  {message.thoughtProcess.map(function (thought, idx) { return (<div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-[10px] font-mono text-primary/60 shrink-0 mt-0.5 w-4 text-right">{idx + 1}.</span>
                      <span className="leading-relaxed">{thought}</span>
                    </div>); })}
                </div>
              </collapsible_1.CollapsibleContent>
            </collapsible_1.Collapsible>
          </div>)}
      </div>
    </framer_motion_1.motion.div>);
}
