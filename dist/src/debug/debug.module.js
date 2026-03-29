"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugModule = void 0;
const common_1 = require("@nestjs/common");
const debug_controller_1 = require("./debug.controller");
const faq_module_1 = require("../faq/faq.module");
let DebugModule = class DebugModule {
};
exports.DebugModule = DebugModule;
exports.DebugModule = DebugModule = __decorate([
    (0, common_1.Module)({
        imports: [faq_module_1.FaqModule],
        controllers: [debug_controller_1.DebugController],
    })
], DebugModule);
//# sourceMappingURL=debug.module.js.map