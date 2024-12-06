// To parse this data:
//
//   import { Convert, IJMetadata } from "./file";
//
//   const iJMetadata = Convert.toIJMetadata(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export type IJMetadata = {
    publication: Publication;
    coverImage?: string;
}

export type Publication = {
    abstract:             null | string;
    authors:              AuthorElement[];
    categories:           string[];
    comments:             Comment[];
    date_submitted:       string;
    journals:             Journal[];
    license:              string;
    publication_id:       number;
    reviews:              Review[];
    revisions:            Revision[];
    source_code_git_repo: null | string;
    submitted_by_author:  SubmittedByAuthor;
    tags:                 string[] | null;
    title:                string;
    articles?:            null[];
}

export type AuthorElement = {
    author_fullname:    string;
    author_place:       number;
    persona_email?:     string;
    persona_firstname?: string;
    persona_id:         number | null;
    persona_lastname?:  string;
}

export type Comment = {
    content:           string;
    date:              Date;
    persona_email:     null | string;
    persona_firstname: null | string;
    persona_id:        number;
    persona_lastname:  null | string;
}

export type Journal = {
    journal_id:   number;
    journal_name: JournalName;
}

export enum JournalName {
    TheInsightJournal = "The Insight Journal",
    TheMIDASJournal = "The MIDAS Journal",
    TheVTKJournal = "The VTK Journal",
}

export type Review = {
    author:    ReviewAuthor;
    content:   string;
    date:      string;
    review_id: number;
}

export type ReviewAuthor = {
    author_email:     null | string;
    author_firstname: null | string;
    author_id:        number | null;
    author_lastname:  null | string;
}

export type Revision = {
    article:             null | string;
    citation_list?:      CitationList[];
    dapp:                null;
    dataset:             null;
    doi:                 string;
    handle:              string;
    source_code:         null | string;
    source_code_git_ref: null;
}

export type CitationList = {
    doi?:         string;
    key:          Key;
    score?:       number;
    unstructured: string;
}

export enum Key {
    Ref1 = "ref1",
    Ref10 = "ref10",
    Ref11 = "ref11",
    Ref12 = "ref12",
    Ref13 = "ref13",
    Ref14 = "ref14",
    Ref15 = "ref15",
    Ref16 = "ref16",
    Ref17 = "ref17",
    Ref18 = "ref18",
    Ref19 = "ref19",
    Ref2 = "ref2",
    Ref20 = "ref20",
    Ref21 = "ref21",
    Ref22 = "ref22",
    Ref23 = "ref23",
    Ref24 = "ref24",
    Ref25 = "ref25",
    Ref26 = "ref26",
    Ref27 = "ref27",
    Ref28 = "ref28",
    Ref29 = "ref29",
    Ref3 = "ref3",
    Ref30 = "ref30",
    Ref31 = "ref31",
    Ref32 = "ref32",
    Ref33 = "ref33",
    Ref34 = "ref34",
    Ref35 = "ref35",
    Ref36 = "ref36",
    Ref37 = "ref37",
    Ref4 = "ref4",
    Ref5 = "ref5",
    Ref6 = "ref6",
    Ref7 = "ref7",
    Ref8 = "ref8",
    Ref9 = "ref9",
}

export type SubmittedByAuthor = {
    author_email:       null | string;
    author_firstname:   null | string;
    author_fullname:    string;
    author_id:          number | null;
    author_institution: string;
    author_lastname:    null | string;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toIJMetadata(json: string): IJMetadata {
        return cast(JSON.parse(json), r("IJMetadata"));
    }

    public static iJMetadataToJson(value: IJMetadata): string {
        return JSON.stringify(uncast(value, r("IJMetadata")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "IJMetadata": o([
        { json: "publication", js: "publication", typ: r("Publication") },
        { json: "coverImage", js: "coverImage", typ: u(undefined, "") },
    ], false),
    "Publication": o([
        { json: "abstract", js: "abstract", typ: u(null, "") },
        { json: "authors", js: "authors", typ: a(r("AuthorElement")) },
        { json: "categories", js: "categories", typ: a("") },
        { json: "comments", js: "comments", typ: a(r("Comment")) },
        { json: "date_submitted", js: "date_submitted", typ: "" },
        { json: "journals", js: "journals", typ: a(r("Journal")) },
        { json: "license", js: "license", typ: "" },
        { json: "publication_id", js: "publication_id", typ: 0 },
        { json: "reviews", js: "reviews", typ: a(r("Review")) },
        { json: "revisions", js: "revisions", typ: a(r("Revision")) },
        { json: "source_code_git_repo", js: "source_code_git_repo", typ: u(null, "") },
        { json: "submitted_by_author", js: "submitted_by_author", typ: r("SubmittedByAuthor") },
        { json: "tags", js: "tags", typ: u(a(""), null) },
        { json: "title", js: "title", typ: "" },
        { json: "articles", js: "articles", typ: u(undefined, a(null)) },
    ], false),
    "AuthorElement": o([
        { json: "author_fullname", js: "author_fullname", typ: "" },
        { json: "author_place", js: "author_place", typ: 0 },
        { json: "persona_email", js: "persona_email", typ: u(undefined, "") },
        { json: "persona_firstname", js: "persona_firstname", typ: u(undefined, "") },
        { json: "persona_id", js: "persona_id", typ: u(0, null) },
        { json: "persona_lastname", js: "persona_lastname", typ: u(undefined, "") },
    ], false),
    "Comment": o([
        { json: "content", js: "content", typ: "" },
        { json: "date", js: "date", typ: Date },
        { json: "persona_email", js: "persona_email", typ: u(null, "") },
        { json: "persona_firstname", js: "persona_firstname", typ: u(null, "") },
        { json: "persona_id", js: "persona_id", typ: 0 },
        { json: "persona_lastname", js: "persona_lastname", typ: u(null, "") },
    ], false),
    "Journal": o([
        { json: "journal_id", js: "journal_id", typ: 0 },
        { json: "journal_name", js: "journal_name", typ: r("JournalName") },
    ], false),
    "Review": o([
        { json: "author", js: "author", typ: r("ReviewAuthor") },
        { json: "content", js: "content", typ: "" },
        { json: "date", js: "date", typ: "" },
        { json: "review_id", js: "review_id", typ: 0 },
    ], false),
    "ReviewAuthor": o([
        { json: "author_email", js: "author_email", typ: u(null, "") },
        { json: "author_firstname", js: "author_firstname", typ: u(null, "") },
        { json: "author_id", js: "author_id", typ: u(0, null) },
        { json: "author_lastname", js: "author_lastname", typ: u(null, "") },
    ], false),
    "Revision": o([
        { json: "article", js: "article", typ: u(null, "") },
        { json: "citation_list", js: "citation_list", typ: u(undefined, a(r("CitationList"))) },
        { json: "dapp", js: "dapp", typ: null },
        { json: "dataset", js: "dataset", typ: null },
        { json: "doi", js: "doi", typ: "" },
        { json: "handle", js: "handle", typ: "" },
        { json: "source_code", js: "source_code", typ: u(null, "") },
        { json: "source_code_git_ref", js: "source_code_git_ref", typ: null },
    ], false),
    "CitationList": o([
        { json: "doi", js: "doi", typ: u(undefined, "") },
        { json: "key", js: "key", typ: r("Key") },
        { json: "score", js: "score", typ: u(undefined, 3.14) },
        { json: "unstructured", js: "unstructured", typ: "" },
    ], false),
    "SubmittedByAuthor": o([
        { json: "author_email", js: "author_email", typ: u(null, "") },
        { json: "author_firstname", js: "author_firstname", typ: u(null, "") },
        { json: "author_fullname", js: "author_fullname", typ: "" },
        { json: "author_id", js: "author_id", typ: u(0, null) },
        { json: "author_institution", js: "author_institution", typ: "" },
        { json: "author_lastname", js: "author_lastname", typ: u(null, "") },
    ], false),
    "JournalName": [
        "The Insight Journal",
        "The MIDAS Journal",
        "The VTK Journal",
    ],
    "Key": [
        "ref1",
        "ref10",
        "ref11",
        "ref12",
        "ref13",
        "ref14",
        "ref15",
        "ref16",
        "ref17",
        "ref18",
        "ref19",
        "ref2",
        "ref20",
        "ref21",
        "ref22",
        "ref23",
        "ref24",
        "ref25",
        "ref26",
        "ref27",
        "ref28",
        "ref29",
        "ref3",
        "ref30",
        "ref31",
        "ref32",
        "ref33",
        "ref34",
        "ref35",
        "ref36",
        "ref37",
        "ref4",
        "ref5",
        "ref6",
        "ref7",
        "ref8",
        "ref9",
    ],
};
