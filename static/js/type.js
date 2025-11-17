import {generateUUIDLike} from './utils.js'

export class Annotation {
    constructor() {
        this.id = generateUUIDLike();
        this.category = "新标注";
        this.docRanges = [];
        this.codeRanges = [];
        this.updateTime = new Date().toISOString();
    }
}

export class DocumentRange {
    constructor(documentId, start, end, content) {
        this.documentId = documentId;
        this.start = start;
        this.end = end;
        this.content = content;
    }
}

export class CodeRange {
    constructor(documentId, start, end, content) {
        this.documentId = documentId;
        this.start = start;
        this.end = end;
        this.content = content;
    }
}

export class File {
    constructor(name, content, renderedDocument, type, localPath, lastModified = new Date().toISOString()) {
        this.id = generateUUIDLike();
        this.name = name;
        this.content = content;
        this.renderedDocument = renderedDocument || '';
        this.type = type; // doc or code
        this.lastModified = lastModified;
        this.localPath = localPath;
    }
}