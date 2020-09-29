const SDOAdapter = require('schema-org-adapter');
const util = require('./util.js');

const TYPES = {
    VOCAB: 'VOCAB',
    LIST: 'LIST'
};

const PLURAL = {
    'Class': 'Classes',
    'Property': 'Properties',
    'Enumeration': 'Enumerations',
    'Enumeration Member': 'Enumeration Members',
    'Data Type': 'Data Types'
};

class SDOVocabBrowser {
    constructor(elem, vocabOrVocabList, type = TYPES.VOCAB) {
        this.elem = elem;
        this.vocabOrVocabList = vocabOrVocabList;
        this.type = type;

        window.addEventListener('popstate', async (e) => {
            await this.generateHTML();
        });
    }

    async generateHTML() {
        await this.init();

        if (this.isListRendering()) {
            this.generateList();
        } else if (this.isVocabRendering()) {
            this.generateVocab();
        } else if (this.isTermRendering()) {
            this.generateTerm();
        }

        document.body.scrollTop = document.documentElement.scrollTop = 0;
    }

    async init() {
        // Init list
        if (this.listNeedsInit()) {
            await this.initList();
        }

        // Init vocab
        if (this.vocabNeedsInit()) {
            await this.initVocab();
        }
    }

    listNeedsInit() {
        return (this.type === TYPES.LIST && !this.list);
    }

    async initList() {
        let jsonString;
        if (util.isValidUrl(this.vocabOrVocabList)) {
            jsonString = await util.get(this.vocabOrVocabList);
        } else {
            jsonString = this.vocabOrVocabList;
        }
        this.list = JSON.parse(jsonString);
    }

    vocabNeedsInit() {
        const searchParams = new URLSearchParams(window.location.search);
        const listNumber = searchParams.get('voc');
        return ((this.type === TYPES.LIST && listNumber && listNumber !== this.listNumber) ||
            (this.type === TYPES.VOCAB && !this.vocabs));
    }

    async initVocab() {
        let vocab;
        if (this.type === TYPES.VOCAB) {
            vocab = this.vocabOrVocabList;
        } else if (this.type === TYPES.LIST) {
            const searchParams = new URLSearchParams(window.location.search);
            this.listNumber = searchParams.get('voc');
            vocab = this.list['schema:hasPart'][this.listNumber - 1]['@id'];
        }

        this.sdoAdapter = new SDOAdapter();
        const sdoURL = await this.sdoAdapter.constructSDOVocabularyURL('latest', 'all-layers');
        // JSON or URL can both be parsed
        await this.sdoAdapter.addVocabularies([sdoURL, vocab]);

        this.vocabs = this.sdoAdapter.getVocabularies(vocab);
        delete this.vocabs['schema'];
        const vocabNames = Object.keys(this.vocabs);

        this.classes = this.sdoAdapter.getListOfClasses({fromVocabulary: vocabNames});
        this.properties = this.sdoAdapter.getListOfProperties({fromVocabulary: vocabNames});
        this.enumerations = this.sdoAdapter.getListOfEnumerations({fromVocabulary: vocabNames});
        this.enumerationMembers = this.sdoAdapter.getListOfEnumerationMembers({fromVocabulary: vocabNames});
        this.dataTypes = this.sdoAdapter.getListOfDataTypes({fromVocabulary: vocabNames});
    }

    isListRendering() {
        const searchParams = new URLSearchParams(window.location.search);
        return (this.type === TYPES.LIST && !searchParams.get('voc'));
    }

    isVocabRendering() {
        const searchParams = new URLSearchParams(window.location.search);
        return ((this.type === TYPES.LIST && searchParams.get('voc') && !searchParams.get('term')) ||
            (this.type === TYPES.VOCAB && !searchParams.get('term')));
    }

    isTermRendering() {
        const searchParams = new URLSearchParams(window.location.search);
        return searchParams.get('term');
    }

    generateList() {
        this.elem.innerHTML = '' +
            '<div id="mainContent" ' /*vocab="http://schema.org/"*/ + 'typeof="schema:DataSet" resource="' + window.location + '">' +
            this.generateListHeader() +
            this.generateListTable() +
            '</div';
        this.addListEventListener();
    }

    generateListHeader() {
        return '<h1>' + this.list['schema:name'] + '</h1>';
    }

    generateListTable() {
        return '' +
            '<table class="definition-table">' +
            '<thead>' +
            '<tr>' +
            '<th>Name</th>' +
            '<th>IRI</th>' +
            '<th>Author</th>' +
            '<th>Description</th>' +
            '</tr>' +
            '</thead>' +
            '<tbody class="supertype">' +
            this.generateListTbody() +
            '</tbody>' +
            '</table>'
    }

    generateListTbody() {
        return this.list['schema:hasPart'].map((vocab, i) => {
            return '' +
                this.generateTableRow('http://vocab.sti2.at/ds/Vocabulary',
                    util.createIRIwithQueryParam('voc', i + 1),
                    'schema:name',
                    util.createJSLink('a-vocab-name', 'voc', i + 1, 'TODO'),
                    this.generateListSideCols(vocab)
                );
        }).join('');
    }

    generateTableRow(typeOf, resource, mainColProp, mainColTermOrLink, sideCols, mainColClass=null) {
        return '' +
            '<tr typeof="' + typeOf  + '" resource="' + resource + '">' +
            this.generateMainColEntry(mainColProp, mainColTermOrLink, mainColClass) +
            sideCols +
            '</tr>';
    }

    generateMainColEntry(property, link, className=null) {
        return '' +
            '<th' + (className ? ' class="' + className + '"' : '') + ' scope="row">' +
            this.generateCodeLink(link, {'property': property}) +
            '</th>';
    }

    generateListSideCols(vocab) {
        return '' +
            '<td property="@id">' + util.createExternalLink(vocab['@id']) + '</td>' +
            '<td property="schema:author">' + /*TODO: vocab.author + */ '</td>' +
            '<td property="schema:description">' + /*TODO: vocab.description + */ '</td>';
    }

    addListEventListener() {
        const aVocabNames = document.getElementsByClassName('a-vocab-name');

        for (let i = 0; i < aVocabNames.length; i++) { // forEach() not possible ootb for HTMLCollections
            const aVocabName = aVocabNames[i];
            aVocabName.addEventListener('click', async () => {
                history.pushState(null, null, util.createIRIwithQueryParam('voc', i + 1));
                await this.generateHTML();
            });
        }
    }

    generateVocab() {
        this.elem.innerHTML =
            '<div id="mainContent"' + /*vocab="http://schema.org/" + ' typeof="rdfs:Class"*/ +' resource="' + window.location + '">' +
            this.generateVocabHeading() +
            this.generateVocabContentSection() +
            this.generateVocabSection(this.classes, 'Class') +
            this.generateVocabSection(this.properties, 'Property') +
            this.generateVocabSection(this.enumerations, 'Enumeration') +
            this.generateVocabSection(this.enumerationMembers, 'Enumeration Member') +
            this.generateVocabSection(this.dataTypes, 'Data Type') +
            '</div>';
        this.addTermEventListener();
    }

    generateVocabHeading() {
        return '' +
            '<h1>' +
            Object.entries(this.vocabs).map((vocab) => {
                return vocab[0] + ':' + vocab[1]
            }) +
            '</h1>';
    }

    generateVocabContentSection() {
        return '' +
            '<h2>Content</h2>' +
            '<ul>' +
            this.generateVocabContentListElement(this.classes, 'Class') +
            this.generateVocabContentListElement(this.properties, 'Property') +
            this.generateVocabContentListElement(this.enumerations, 'Enumeration') +
            this.generateVocabContentListElement(this.enumerationMembers, 'Enumeration Member') +
            this.generateVocabContentListElement(this.dataTypes, 'Data Type') +
            '</ul>';
    }

    generateVocabContentListElement(objects, typeSingular) {
        if (objects.length !== 0) {
            const typePlural = PLURAL[typeSingular];
            return '<li><a href="#' + util.underscore(typePlural) + '">' + objects.length + ' ' +
                (objects.length === 1 ? typeSingular : typePlural) + '</a></li>';
        }
        return '';
    }

    generateVocabSection(objects, typeSingular) {
        if (objects.length !== 0) {
            const typePlural = PLURAL[typeSingular];
            return '' +
                '<h2 id="' + util.underscore(typePlural) + '">' + typePlural + '</h2>' +
                '<table class="definition-table">' +
                '<thead>' +
                '<tr>' +
                '<th>' + typeSingular + '</th>' +
                '<th>Description</th>' +
                '</tr>' +
                '</thead>' +
                '<tbody class="supertype">' +
                this.generateVocabSectionTbody(objects) +
                '</tbody>' +
                '</table>'
        }
        return '';
    }

    generateVocabSectionTbody(objects) {
        return objects.map((name) => {
            const term = this.sdoAdapter.getTerm(name);
            return this.generateTableRow(term.getTermType(),
                util.createIRIwithQueryParam('term', name),
                '@id',
                util.createJSLink('a-term-name', 'term', name),
                '<td property="rdfs:comment">' + term.getDescription() + '</td>');
        }).join('');
    }

    generateTerm() {
        const searchParams = new URLSearchParams(window.location.search);
        this.term = this.sdoAdapter.getTerm(searchParams.get('term'));

        let html;
        switch(this.term.getTermType()) {
            case 'rdfs:Class':
                html = this.generateClass();
                break;
            case 'rdf:Property':
                html = this.generateProperty();
                break;
            case 'schema:Enumeration':
                html = this.generateEnumeration();
                break;
            case 'soa:EnumerationMember':
                html = this.generateEnumerationMember();
                break;
            case 'schema:DataType':
                html = this.generateDataType();
                break;
        }
        this.elem.innerHTML = html;
        this.addTermEventListener();
    }

    generateClass() {
        const superTypes = this.getTypeStructures(this.term);
        const mainContent = this.generateHeader(superTypes, 'rdfs:subClassOf') +
            this.generateClassProperties();
        return this.generateMainContent('rdfs:Class', mainContent);
    }

    generateHeader(superTypes, superTypeRelationship, breadCrumbStart='', breadCrumbEnd='') {
        return '' +
            '<h1 property="rdfs:label" class="page-title">' + this.term.getIRI(true) + '</h1>' +
            this.generateSuperTypeBreadcrumbs(superTypes, superTypeRelationship, breadCrumbStart, breadCrumbEnd) +
            '</h4>' +
            '<div property="rdfs:comment">' + this.term.getDescription() + '<br><br></div>';
    }

    generateSuperTypeBreadcrumbs(superTypes, superTypeRelationship, breadCrumbStart, breadCrumbEnd) {
        if (superTypes) {
            return  '' +
                '<h4>' +
                superTypes.map((s) => {
                    return '' +
                        '<span class="breadcrumbs">' +
                        breadCrumbStart +
                        s.map((superType, i) => {
                            let html = '';
                            if ((breadCrumbEnd === '' && (i + 2) === s.length) ||
                                (breadCrumbEnd !== '' && (i + 1) === s.length)) {
                                html += this.generateSemanticLink(superTypeRelationship, superType);
                            }
                            html += this.generateLink(superType);
                            return html;
                        }).join(' > ') +
                        breadCrumbEnd +
                        '</span>';
                }).join('<br>') +
                '</h4>';
        }
        return '';
    }

    /**
     *
     * @param term
     * @param {string} superTypeFunc
     * @returns {[][]|null}
     */
    getTypeStructures(term, superTypeFunc='getSuperClasses') {
        const superTypes = term[superTypeFunc](false);
        if (superTypes.length === 0) {
            return [[term.getIRI(true)]];
        } else {
            let ret = [];
            superTypes.forEach((s) => {
                const newTerm = this.sdoAdapter.getTerm(s);
                const newSuperTypes = this.getTypeStructures(newTerm, superTypeFunc);
                newSuperTypes.forEach((n) => {
                    const newList = n.push(term.getIRI(true));
                    ret.push(n);
                });
            });
            return ret;
        }
    }

    generateSemanticLink(property, term) {
        return '<link property="' + util.escHTML(property) + '" href="' + util.escHTML(this.generateHref(term)) + '">';
    }

    generateHref(term) {
        if (this.isTermOfVocab(term)) {
            return util.createIRIwithQueryParam('term', term);
        } else {
            return this.sdoAdapter.getTerm(term).getIRI();
        }
    }

    isTermOfVocab(term) {
        return (this.vocabs && (
            this.classes.includes(term) ||
            this.properties.includes(term) ||
            this.enumerations.includes(term) ||
            this.enumerationMembers.includes(term) ||
            this.dataTypes.includes(term)
        ));
    }

    generateLink(term, attr=null) {
        if (this.isTermOfVocab(term)) {
            return util.createJSLink('a-term-name', 'term', term, null, attr);
        } else {
            return util.createExternalLink(this.generateHref(term), term, attr);
        }
    }

    generateClassProperties() {
        let html = '<table class="definition-table">' +
            this.generateClassPropertiesHeader();

        const classes = [this.term, ...this.term.getSuperClasses().map((c) => this.sdoAdapter.getClass(c))];
        classes.forEach((c) => {
            const properties = c.getProperties(false);
            if (properties.length !== 0) {
                html += '<tbody>' +
                    this.generateClassPropertyHeader(c);
                properties.forEach((p) => {
                    html += this.generatePropertyTableRow(p);
                });
                html += '</tbody>';
            }
        });
        html += '</table>' +
        '<br>'+
        this.generateClassSpecificTypes();

        return html;
    }

    generateClassPropertiesHeader() {
        return  '' +
            '<thead>' +
            '<tr>' +
            '<th>Property</th>' +
            '<th>Expected Type</th>' +
            '<th>Description</th>' +
            '</tr>' +
            '</thead>';
    }

    generateClassPropertyHeader(className) {
        return '' +
            '<tbody>' +
            '<tr class="supertype">' +
            '<th class="supertype-name" colspan="3">' +
            'Properties from ' + this.generateLink(className.getIRI(true)) +
            '</th>' +
            '</tr>' +
            '</tbody>';
    }

    generatePropertyTableRow(p, onlyDomainIncludes=false) {
        return this.generateTableRow('rdfs:Property',
            this.generateHref(p),
            'rdfs:label',
            this.generateLink(p),
            this.generateClassPropertySideCols(p, onlyDomainIncludes),
            'prop-name');
    }

    generateMainContent(typeOf, mainContent) {
        return '' +
            '<div id="mainContent" vocab="http://schema.org/" typeof="' + typeOf + '" resource="' + window.location + '">' +
            mainContent +
            '</div>';
    }

    generateClassPropertySideCols(property, onlyDomainIncludes) {
        const sdoProperty = this.sdoAdapter.getProperty(property);
        return '' +
            '<td class="prop-etc">' + this.generateClassPropertyRange(sdoProperty, onlyDomainIncludes) + '</td>' +
            '<td class="prop-desc" property="rdfs:comment">' + sdoProperty.getDescription() + '</td>';
    }

    generateClassPropertyRange(sdoProperty, onlyDomainIncludes) {
        let expectedType = '';
        const separator = '&nbsp; or <br>';
        if (!onlyDomainIncludes) {
            expectedType = sdoProperty.getRanges(false).map((p) => {
                return this.generateSemanticLink('rangeIncludes', p) + this.generateLink(p);
            }).join(separator);
        }
        const domainIncludes = sdoProperty.getDomains(false).map((d) => {
            return this.generateSemanticLink('domainIncludes', d) +
                (onlyDomainIncludes ? this.generateLink(d) : '');
        }).join(onlyDomainIncludes ? separator : '');
        return expectedType + domainIncludes;
    }

    generateClassSpecificTypes() {
        const subClasses = this.term.getSubClasses(false);
        if (subClasses.length !== 0) {
            return '' +
                '<b>' +
                '<a id="subtypes" title="Link: #subtypes" href="#subtypes" class="clickableAnchor">' +
                'More specific Types' +
                '</a>' +
                '</b>' +
                '<ul>' +
                subClasses.map((s) => {
                    return '<li>' + this.generateLink(s) + '</li>';
                }) +
                '</ul>' +
                '<br>';
        } else {
            return '';
        }
    }

    generateProperty() {
        const startBreadcrumbs = this.generatePropertyStartBreadcrumbs();
        const superProperties = this.getTypeStructures(this.term, 'getSuperProperties');
        const mainContent = this.generateHeader(superProperties, 'rdfs:subPropertyOf', startBreadcrumbs) +
            this.generatePropertyRanges() +
            this.generatePropertyDomainIncludes() +
            this.generatePropertySuperProperties() +
            this.generatePropertySubProperties();
        return this.generateMainContent('rdf:Property', mainContent);
    }

    generatePropertyStartBreadcrumbs() {
        return '' +
            this.generateLink('schema:Thing') +
            " > " +
            this.generateLink('schema:Property', {'title': 'Defined in section: meta.schema.org'}) +
            " > ";
    }

    generatePropertyRanges() {
        const ranges = this.term.getRanges(false).map((r) => {
            const title = {'title': 'The \'' + this.term.getIRI(true) + '\' property has values that include instances of the' +
                ' \'' + r + '\' type.'};
            return this.generateCodeLink(r, null, title, 'rangeIncludes');
        }).join('<br>');

        return this.generateDefinitionTable('Values expected to be one of these types', '<td>'+  ranges +'</td>');
    }

    generateCodeLink(termOrLink, codeAttr=null, linkAttr=null, rdfa=null) {
        return '' +
            '<code' + util.createHTMLAttr(codeAttr) + '>' +
            this.generateFullLink(termOrLink, linkAttr, rdfa) +
            '</code>';
    }

    generateFullLink(termOrLink, linkAttr, rdfa) {
        let term = null;
        try { term = this.sdoAdapter.getTerm(termOrLink); } catch (e) { }
        return '' +
            (rdfa ? this.generateSemanticLink(rdfa, termOrLink) : '') +
            (term ? this.generateLink(termOrLink, linkAttr) : termOrLink);
    }

    generateDefinitionTable(ths, trs) {
        if (!Array.isArray(ths)) {
            ths = [ths];
        }
        if (!Array.isArray(trs)) {
            trs = [trs];
        }
        return '' +
            '<table class="definition-table">' +
            '<thead>' +
            '<tr>' +
            ths.map((th) => {
                return '<th>' + th + '</th>';
            }).join('') +
            '</tr>' +
            '</thead>' +
            '<tbody>' +
            (trs[0].startsWith('<tr') ? trs.join('') : trs.map((tr) => {
                return '<tr>' + tr + '</tr>';
            }).join('')) +
            '</tbody>' +
            '</table>';
    }

    generatePropertyDomainIncludes() {
        const domains = this.term.getDomains(false).map((d) => {
            const title = {'title': 'The \'' + this.term.getIRI(true) + '\' property ' + 'is used on the \'' + d +
                    '\' ' + 'type'};
            return this.generateCodeLink(d, null, title, 'domainIncludes');
        }).join('<br>');

        return this.generateDefinitionTable('Used on these types', '<td>' + domains + '</td>');
    }

    generatePropertySuperProperties() {
        const superProperties = this.term.getSuperProperties(false);
        return this.generatePropertyRelationship(superProperties, 'Super-properties');
    }

    generatePropertyRelationship(relatedTerms, tableHeader) {
        if (relatedTerms.length !== 0) {
            const relatedTermsHTML = relatedTerms.map((s) => {
                const title = {
                    'title' : s + ': \'\'' + this.sdoAdapter.getProperty(s).getDescription() + '\'\''
                };
                return this.generateCodeLink(s, null, title);
            }).join('<br>');

            return this.generateDefinitionTable(tableHeader, '<td>' + relatedTermsHTML + '</td>');
        } else {
            return '';
        }
    }

    generatePropertySubProperties() {
        const subProperties = this.term.getSubProperties(false);
        return this.generatePropertyRelationship(subProperties, 'Sub-properties');
    }

    generateEnumeration() {
        const mainContent = this.generateHeader(this.getTypeStructures(this.term), 'rdfs:subClassOf') +
            this.generateEnumerationEnumerationMembers() +
            this.generateRangesOf(true);
        return this.generateMainContent('rdfs:Class', mainContent);
    }

    generateEnumerationEnumerationMembers() {
        const enumMembers = this.term.getEnumerationMembers();
        if (enumMembers.length !== 0) {
            return '' +
                'An Enumeration with:<br>' +
                '<b>' +
                '<a id="enumbers" title="Link: #enumbers" href="#enumbers" class="clickableAnchor">' +
                'Enumeration members' +
                '</a>' +
                '</b>' +
                '<ul>' +
                enumMembers.map((e) => {
                   return '<li>' + this.generateLink(e) + '</li>';
                }).join('') +
                '</ul>' +
                '<br>';
        } else {
            return '';
        }
    }

    generateRangesOf(isForEnumMember=false) {
        const rangeOf = this.term.isRangeOf();
        if (rangeOf.length !== 0) {
            const trs = rangeOf.map((r) => {
                return this.generatePropertyTableRow(r, true);
            });

            return '' +
                '<div id="incoming">' +
                'Instances of ' + this.generateLink(this.term.getIRI(true)) +
                (isForEnumMember ? ' and its enumeration members or subtypes' : '') +
                ' may appear as a value for the following properties' +
                '</div>' +
                '<br>' +
                this.generateDefinitionTable(['Property', 'On Types', 'Description'], trs);
        } else {
            return '';
        }
    }

    generateEnumerationMember () {
        const typeStructures = this.term.getDomainEnumerations().flatMap((d) => {
            return this.getTypeStructures(this.sdoAdapter.getClass(d));
        });
        const breadCrumbEnd = ' :: ' + this.generateLink(this.term.getIRI(true));
        // TODO: Can we use @type here?
        const mainContent = this.generateHeader(typeStructures, '@type', '', breadCrumbEnd) +
            this.generateEnumerationMemberDomains();
        return this.generateMainContent('rdfs:Class', mainContent);
    }

    generateEnumerationMemberDomains() {
        const domains = this.term.getDomainEnumerations();
        return 'A member value for enumeration' + (domains.length > 1 ? 's' : '') + ': ' +
            domains.map((d) => this.generateLink(d)).join(', ') +
            '<br>';
    }

    generateDataType() {
        const breadCrumbStart = this.generateFullLink('schema:DataType', null, 'rdfs:subClassOf') + ' > ';
        const mainContent = '' +
            this.generateHeader(this.getTypeStructures(this.term, 'getSuperDataTypes'), '', breadCrumbStart) +
            this.generateRangesOf();
        return this.generateMainContent('rdfs:Class', mainContent);
    }

    addTermEventListener() {
        const aTermNames = document.getElementsByClassName('a-term-name');

        for (const aTermName of aTermNames) { // forEach() not possible ootb for HTMLCollections
            aTermName.addEventListener('click', async () => {
                history.pushState(null, null, util.createIRIwithQueryParam('term', aTermName.innerText));
                await this.generateHTML();
            });
        }
    }
}

module.exports = SDOVocabBrowser;