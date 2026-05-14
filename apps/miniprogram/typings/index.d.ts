/// <reference path="./types/index.d.ts" />

declare const wx: WechatMiniprogram.Wx;
declare const App: WechatMiniprogram.App.Constructor;
declare const Page: WechatMiniprogram.Page.Constructor;
declare const Component: WechatMiniprogram.Component.Constructor;
declare const Behavior: WechatMiniprogram.Behavior.Constructor;
declare function getApp<T = unknown>(): T;
declare function getCurrentPages(): WechatMiniprogram.Page.Instance<any, any>[];
declare function requirePlugin(name: string): any;

// Minimal placeholder. In real project, install `miniprogram-api-typings`.
declare namespace WechatMiniprogram {
  interface Wx {
    [key: string]: any;
  }
  namespace App { type Constructor = (opts: any) => any; }
  namespace Page { type Constructor = (opts: any) => any; type Instance<D, M> = any; }
  namespace Component { type Constructor = (opts: any) => any; }
  namespace Behavior { type Constructor = (opts: any) => any; }
  interface RequestOption { method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; [k: string]: any; }
}
