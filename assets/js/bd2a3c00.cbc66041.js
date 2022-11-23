"use strict";(self.webpackChunkdocs=self.webpackChunkdocs||[]).push([[8933],{4852:(e,t,r)=>{r.d(t,{Zo:()=>u,kt:()=>d});var n=r(9231);function a(e,t,r){return t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e}function o(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),r.push.apply(r,n)}return r}function i(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{};t%2?o(Object(r),!0).forEach((function(t){a(e,t,r[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):o(Object(r)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(r,t))}))}return e}function l(e,t){if(null==e)return{};var r,n,a=function(e,t){if(null==e)return{};var r,n,a={},o=Object.keys(e);for(n=0;n<o.length;n++)r=o[n],t.indexOf(r)>=0||(a[r]=e[r]);return a}(e,t);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);for(n=0;n<o.length;n++)r=o[n],t.indexOf(r)>=0||Object.prototype.propertyIsEnumerable.call(e,r)&&(a[r]=e[r])}return a}var s=n.createContext({}),c=function(e){var t=n.useContext(s),r=t;return e&&(r="function"==typeof e?e(t):i(i({},t),e)),r},u=function(e){var t=c(e.components);return n.createElement(s.Provider,{value:t},e.children)},m={inlineCode:"code",wrapper:function(e){var t=e.children;return n.createElement(n.Fragment,{},t)}},p=n.forwardRef((function(e,t){var r=e.components,a=e.mdxType,o=e.originalType,s=e.parentName,u=l(e,["components","mdxType","originalType","parentName"]),p=c(r),d=a,g=p["".concat(s,".").concat(d)]||p[d]||m[d]||o;return r?n.createElement(g,i(i({ref:t},u),{},{components:r})):n.createElement(g,i({ref:t},u))}));function d(e,t){var r=arguments,a=t&&t.mdxType;if("string"==typeof e||a){var o=r.length,i=new Array(o);i[0]=p;var l={};for(var s in t)hasOwnProperty.call(t,s)&&(l[s]=t[s]);l.originalType=e,l.mdxType="string"==typeof e?e:a,i[1]=l;for(var c=2;c<o;c++)i[c]=r[c];return n.createElement.apply(null,i)}return n.createElement.apply(null,r)}p.displayName="MDXCreateElement"},5413:(e,t,r)=>{r.r(t),r.d(t,{assets:()=>s,contentTitle:()=>i,default:()=>m,frontMatter:()=>o,metadata:()=>l,toc:()=>c});var n=r(7626),a=(r(9231),r(4852));const o={sidebar_position:3},i="Migrations",l={unversionedId:"local-storage/migrations",id:"local-storage/migrations",title:"Migrations",description:"Every schema change requires a migration, including the initial one. While CLI migration management is not yet completed, I recommend creating a migrations directory in your generated client directory and adding the initial migration for your schema manually in a file v1.ts:",source:"@site/docs/local-storage/migrations.md",sourceDirName:"local-storage",slug:"/local-storage/migrations",permalink:"/docs/local-storage/migrations",draft:!1,editUrl:"https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/docs/local-storage/migrations.md",tags:[],version:"current",sidebarPosition:3,frontMatter:{sidebar_position:3},sidebar:"tutorialSidebar",previous:{title:"Generating the client code",permalink:"/docs/local-storage/generate-client"},next:{title:"Indexes & Querying",permalink:"/docs/local-storage/querying"}},s={},c=[],u={toc:c};function m(e){let{components:t,...r}=e;return(0,a.kt)("wrapper",(0,n.Z)({},u,r,{components:t,mdxType:"MDXLayout"}),(0,a.kt)("h1",{id:"migrations"},"Migrations"),(0,a.kt)("p",null,"Every schema change requires a migration, including the initial one. While CLI migration management is not yet completed, I recommend creating a ",(0,a.kt)("inlineCode",{parentName:"p"},"migrations")," directory in your generated client directory and adding the initial migration for your schema manually in a file ",(0,a.kt)("inlineCode",{parentName:"p"},"v1.ts"),":"),(0,a.kt)("pre",null,(0,a.kt)("code",{parentName:"pre",className:"language-ts"},"// client/migrations/v1.ts\n\nimport { createDefaultMigration } from '@lo-fi/web';\nimport schema from '../../schema.ts';\n\nexport default createDefaultMigration(schema);\n")),(0,a.kt)("p",null,"Then collect the migrations in order as an array to provide to the client:"),(0,a.kt)("pre",null,(0,a.kt)("code",{parentName:"pre",className:"language-ts"},"// client/migrations.ts\nimport v1 from './migrations/v1.js';\n\nexport default [v1];\n")),(0,a.kt)("p",null,"Work is planned for the CLI to create and maintain this file structure for you."),(0,a.kt)("p",null,(0,a.kt)("inlineCode",{parentName:"p"},"createDefaultMigration")," will just keep any existing documents in-place and create or delete any new or removed indexes. You can use this for your first version, and if you ever make a version that only adds or removes indexes."),(0,a.kt)("p",null,"If you change the shape of your data, though, you will need to write a full migration. Docs are todo on this, but the tool to do that is exported as ",(0,a.kt)("inlineCode",{parentName:"p"},"migrate")," and takes a function where you run all of your data transformers using tools supplied in the first argument."))}m.isMDXComponent=!0}}]);