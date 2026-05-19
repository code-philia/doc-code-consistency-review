<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns:c="http://www.w3.org/ns/xproc-step"
                xmlns:css="http://www.w3.org/1996/css"
                xmlns:dbk="http://docbook.org/ns/docbook"
                xmlns:docx2tex="http://transpect.io/docx2tex"
                xmlns:functx="http://www.functx.com"
                xmlns:html="http://www.w3.org/1999/xhtml"
                xmlns:mml2tex="http://transpect.io/mml2tex"
                xmlns:svg="http://www.w3.org/2000/svg"
                xmlns:tex="http://www-cs-faculty.stanford.edu/~uno/"
                xmlns:tr="http://transpect.io"
                xmlns:xlink="http://www.w3.org/1999/xlink"
                xmlns:xml2tex="http://transpect.io/xml2tex"
                xmlns:xs="http://www.w3.org/2001/XMLSchema"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                version="2.0">
   <xsl:import href="http://transpect.io/xslt-util/functx/xsl/functx.xsl"/>
   <xsl:import href="http://transpect.io/xml2tex/xsl/functions.xsl"/>
   <xsl:import xmlns="http://transpect.io/xml2tex"
               href="http://transpect.io/mml2tex/xsl/mml2tex.xsl"/>
   <xsl:import xmlns="http://transpect.io/xml2tex"
               href="http://transpect.io/xslt-util/colors/xsl/colors.xsl"/>
   <xsl:import xmlns="http://transpect.io/xml2tex"
               href="http://transpect.io/xslt-util/paths/xsl/paths.xsl"/>
   <xsl:import xmlns="http://transpect.io/xml2tex"
               href="http://transpect.io/xslt-util/roman-numerals/xsl/roman2int.xsl"/>
   <xsl:param xmlns="http://transpect.io/xml2tex" name="table-model" as="xs:string"/>
   <xsl:param xmlns="http://transpect.io/xml2tex"
              name="a11y"
              as="xs:boolean"
              select="false()">
    
  </xsl:param>
   <xsl:key xmlns="http://transpect.io/xml2tex"
            name="style"
            match="css:rule"
            use="@name"/>
   <xsl:key xmlns="http://transpect.io/xml2tex"
            name="item-by-id"
            match="*[@xml:id]"
            use="@xml:id"/>
   <xsl:param name="decompose-diacritics" as="xs:boolean" select="true()"/>
   <xsl:output method="text" media-type="text/plain" encoding="UTF8"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="xerif"
                 as="xs:boolean"
                 select="false()"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="root"
                 as="document-node()"
                 select="root()"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="path"
                 as="xs:string"
                 select="tr:path(base-uri())"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="basename"
                 as="xs:string"
                 select="tr:basename(/dbk:hub/@xml:base)"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="colors"
                 as="xs:string*"
                 select="(                          //@css:background-color,                          //@css:color[not(every $i in  tr:hex-rgb-color-to-ints(.) satisfies $i &lt; 35                                             or parent::*[(@role, @name) = ('ZFinlineequation', 'ZFequation')]                                           or ancestor::dbk:para/dbk:phrase[@role = ('ZFinlineequation', 'ZFequation', 'Hyperlink')]                                           or ancestor-or-self::dbk:link                                           or parent::*[@native-name eq 'Hyperlink'])],                          for $mml2tex-color in (                                         for $mml2tex-snippet in //processing-instruction('mml2tex')/tokenize(., '\\textcolor')                                          return replace($mml2tex-snippet, '\{([-a-z0-9]+?)\}.*$', '$1', 'i')                                         )[not(position() eq 1)]                          return if(starts-with($mml2tex-color, '#')) then $mml2tex-color else tr:color-keyword-to-hex-rgb($mml2tex-color)                          )"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="langs"
                 select="distinct-values(//@xml:lang)"
                 as="xs:string*"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="footnotes"
                 select="//dbk:footnote"
                 as="element(dbk:footnote)*"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="letter-spacing-def"
                 select="'soul'"
                 as="xs:string?">
    
  </xsl:variable>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="elements-where-pagebreaks-are-ignored"
                 as="xs:string+"
                 select="'part', 'chapter', 'section', 'index'"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="titles-where-pagebreaks-are-ignored"
                 as="xs:string+"
                 select="'part', 'chapter', 'section', 'index'"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="text-style-elements"
                 select="'phrase', 'superscript', 'subscript'"
                 as="xs:string+"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="svg-images"
                 as="element(svg:svg)*"
                 select="//svg:svg"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="footnote-ids"
                 as="xs:string*"
                 select="for $i in $footnotes return (if ($i/@xml:id) then $i/@xml:id else generate-id($i))"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="see-regex"
                 as="xs:string"
                 select="'^(see\salso|see|voir|véase|vedi|ver|siehe\sauch|siehe|请参阅|ראה|انظر|참조)\p{Zs}*(.*?)$'"/>
   <xsl:variable xmlns="http://transpect.io/xml2tex"
                 name="see-also-regex"
                 as="xs:string"
                 select="'^(((see\s)?also)|((siehe\s)?auch))$'"/>
   <xsl:template xmlns="http://transpect.io/xml2tex" name="index-content">
      <xsl:variable name="page-number-style" as="xs:string*">
         <xsl:choose>
            <xsl:when test="matches(@role, 'hub:pagenum-bold')">
               <xsl:text>|textbf</xsl:text>
            </xsl:when>
            <xsl:when test="matches(@role, 'hub:pagenum-italic')">
               <xsl:text>|textit</xsl:text>
            </xsl:when>
         </xsl:choose>
      </xsl:variable>
      <xsl:choose>
         <xsl:when test="@class eq 'startofrange'">
            <xsl:text/>
            <xsl:value-of select="'{'"/>
            <xsl:text/>
            <xsl:text/>
            <xsl:choose>
               <xsl:when test="(.) instance of element()">
                  <xsl:apply-templates mode="#current"/>
               </xsl:when>
               <xsl:otherwise>
                  <xsl:next-match/>
               </xsl:otherwise>
            </xsl:choose>
            <xsl:text/>
            <xsl:text/>
            <xsl:value-of select="'|('"/>
            <xsl:text/>
            <xsl:sequence select="$page-number-style"/>
            <xsl:text>}</xsl:text>
         </xsl:when>
         <xsl:when test="@class eq 'endofrange'">
            <xsl:text/>
            <xsl:value-of select="'{'"/>
            <xsl:text/>
            <xsl:text/>
            <xsl:choose>
               <xsl:when test="(key('item-by-id', @startref)/node()) instance of element()">
                  <xsl:apply-templates select="if((key('item-by-id', @startref)/node()) instance of node()) then (key('item-by-id', @startref)/node()) else node()"
                                       mode="#current"/>
               </xsl:when>
               <xsl:when test="not((key('item-by-id', @startref)/node()) instance of item())">
                  <xsl:apply-templates select="if(not((key('item-by-id', @startref)/node()) instance of item())) then (key('item-by-id', @startref)/node()) else node()"
                                       mode="#current"/>
               </xsl:when>
               <xsl:when test="(key('item-by-id', @startref)/node()) instance of text()">
                  <xsl:apply-templates select="if((key('item-by-id', @startref)/node()) instance of text()) then (key('item-by-id', @startref)/node()) else node()"
                                       mode="#current"/>
               </xsl:when>
               <xsl:otherwise>
                  <xsl:value-of select="key('item-by-id', @startref)/node()"/>
               </xsl:otherwise>
            </xsl:choose>
            <xsl:text/>
            <xsl:text/>
            <xsl:value-of select="'|)'"/>
            <xsl:text/>
            <xsl:sequence select="$page-number-style"/>
            <xsl:text>}</xsl:text>
         </xsl:when>
         <xsl:otherwise>
            <xsl:text/>
            <xsl:value-of select="'{'"/>
            <xsl:text/>
            <xsl:apply-templates mode="xml2tex"/>
            <xsl:sequence select="$page-number-style"/>
            <xsl:text>}</xsl:text>
         </xsl:otherwise>
      </xsl:choose>
   </xsl:template>
   <xsl:template xmlns="http://transpect.io/xml2tex"
                 match="dbk:phrase[   @css:font-style   eq 'italic'     or exists(key('style', @role)[@css:font-style   eq 'italic'])                                   or @css:font-weight  eq 'bold'       or exists(key('style', @role)[@css:font-weight  eq 'bold'])                                   or @css:font-variant eq 'small-caps' or exists(key('style', @role)[@css:font-variant eq 'small-caps'])                                   or @css:font-style   eq 'normal'                                   or @css:font-weight  eq 'normal']                                  [following-sibling::node()[1][self::dbk:indexterm]]"
                 mode="escape-bad-chars">
      <xsl:copy>
         <xsl:apply-templates select="@*, node()" mode="#current"/>
         <xsl:copy-of select="following-sibling::dbk:indexterm[1]"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template xmlns="http://transpect.io/xml2tex"
                 match="dbk:indexterm[preceding-sibling::node()[1][self::dbk:phrase[   @css:font-style   eq 'italic'     or exists(key('style', @role)[@css:font-style   eq 'italic'])                                                                                    or @css:font-weight  eq 'bold'       or exists(key('style', @role)[@css:font-weight  eq 'bold'])                                                                                    or @css:font-variant eq 'small-caps' or exists(key('style', @role)[@css:font-variant eq 'small-caps'])                                                                                    or @css:font-style   eq 'normal'                                                                                    or @css:font-weight  eq 'normal']]]"
                 mode="escape-bad-chars"/>
   <xsl:function xmlns="http://transpect.io/xml2tex" name="tr:add-cca" as="xs:string?">
      <xsl:param name="pos" as="xs:string"/>
      <xsl:param name="type" as="xs:string"/>
      <xsl:sequence select="if ($a11y) then  concat('\ccaVstruct', $pos, '{', $type, '}')  else ()"/>
   </xsl:function>
   <xsl:function xmlns="http://transpect.io/xml2tex"
                 name="tr:suppress-structure"
                 as="xs:boolean">
      <xsl:param name="elt" as="element()"/>
      <xsl:sequence select="if ($a11y)                            then exists($elt[parent::*[self::*:legalnotice]                                             or                                             (every $node in node() satisfies $node[self::processing-instruction()])                                           ]                                      )                            else true()"/>
   </xsl:function>
   <xsl:function xmlns="http://transpect.io/xml2tex"
                 name="tr:enumerate-list-type"
                 as="xs:string">
      <xsl:param name="numeration" as="xs:string"/>
      <xsl:param name="override" as="xs:string?"/>
      <xsl:variable name="indizes"
                    select="tokenize($override, '\p{P}')[. ne '']"
                    as="xs:string*"/>
      <xsl:variable name="separators"
                    select="tokenize($override, '[\w\d]+')[. ne '']"
                    as="xs:string*"/>
      <xsl:variable name="list-type"
                    as="xs:string"
                    select="     if($numeration eq 'loweralpha') then 'a'                           else if($numeration eq 'upperalpha') then 'A'                           else if($numeration eq 'lowerroman') then 'i'                           else if($numeration eq 'upperroman') then 'I'                           else                                      '1'"/>
      <xsl:value-of select="string-join(('[{',                                       for $i in (1 to max((count($indizes), count($separators))))                                       return if(    count($separators) gt count($indizes))                                              then ($separators[$i], $list-type[$indizes[$i]])                                              else ($list-type, $separators[$i]),                                       '}]'                                                ), '')"/>
   </xsl:function>
   <xsl:function xmlns="http://transpect.io/xml2tex"
                 name="tr:list-number-to-integer"
                 as="xs:integer">
      <xsl:param name="override" as="xs:string"/>
      <xsl:param name="list-type" as="xs:string"/>
      <xsl:variable name="counter"
                    as="xs:string"
                    select="replace($override, '.*?([A-Z0-9]+).*', '$1', 'i')"/>
      <xsl:choose>
         <xsl:when test="$list-type = ('upperroman', 'lowerroman') and matches($counter, '[ivxlcdm]', 'i')">
            <xsl:value-of select="tr:roman-to-int($counter)"/>
         </xsl:when>
         <xsl:when test="$list-type = 'loweralpha' or matches($counter, '[a-z]')">
            <xsl:value-of select="string-length(substring-before('abcdefghijklmnopqrstuvwxyz', $counter)) + 1"/>
         </xsl:when>
         <xsl:when test="$list-type = 'upperalpha' or matches($counter, '[A-Z]')">
            <xsl:value-of select="string-length(substring-before('ABCDEFGHIJKLMNOPQRSTUVWXYZ', $counter)) + 1"/>
         </xsl:when>
         <xsl:when test="not($counter)">
            <xsl:value-of select="1"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="xs:integer((normalize-space($counter)))"/>
         </xsl:otherwise>
      </xsl:choose>
   </xsl:function>
   <xsl:template match="/" mode="xml2tex" priority="1000000">
      <c:data content-type="text/plain">
         <xsl:text>% docx2tex 1.10 --- ``TeX without any tariffs (local regulations may vary)'' 
</xsl:text>
         <xsl:text>% 
</xsl:text>
         <xsl:text>% docx2tex is Open Source and  
</xsl:text>
         <xsl:text>% you can download it on GitHub: 
</xsl:text>
         <xsl:text>% https://github.com/transpect/docx2tex 
</xsl:text>
         <xsl:text>%  
</xsl:text>
         <xsl:text>\documentclass{scrbook} 
</xsl:text>
         <xsl:text>\usepackage[T1]{fontenc} 
</xsl:text>
         <xsl:text>\usepackage[utf8]{inputenc} 
</xsl:text>
         <xsl:if xmlns="http://transpect.io/xml2tex" test="//dbk:imagedata">
            <xsl:text>\usepackage{graphicx}
</xsl:text>
         </xsl:if>
         <xsl:text>\usepackage{hyperref} 
</xsl:text>
         <xsl:text>\usepackage{multirow} 
</xsl:text>
         <xsl:text>\usepackage{tabularx} 
</xsl:text>
         <xsl:text>\usepackage{color} 
</xsl:text>
         <xsl:text>\usepackage{textcomp} 
</xsl:text>
         <xsl:choose xmlns="http://transpect.io/xml2tex">
            <xsl:when test="//dbk:div[@role eq 'hub:index'][1]">
               <xsl:text>\usepackage[safe]{tipa}
</xsl:text>
            </xsl:when>
            <xsl:otherwise>
               <xsl:text>\usepackage{tipa}
</xsl:text>
            </xsl:otherwise>
         </xsl:choose>
         <xsl:text>\usepackage{amsmath} 
</xsl:text>
         <xsl:text>\usepackage{amssymb} 
</xsl:text>
         <xsl:text>\usepackage{amsfonts} 
</xsl:text>
         <xsl:text>\usepackage{amsxtra} 
</xsl:text>
         <xsl:text>\usepackage{wasysym} 
</xsl:text>
         <xsl:text>\usepackage{isomath} 
</xsl:text>
         <xsl:text>\usepackage{mathtools} 
</xsl:text>
         <xsl:text>\usepackage{txfonts} 
</xsl:text>
         <xsl:text>\usepackage{upgreek} 
</xsl:text>
         <xsl:text>\usepackage{enumerate} 
</xsl:text>
         <xsl:text>\usepackage{tensor} 
</xsl:text>
         <xsl:text>\usepackage{pifont} 
</xsl:text>
         <xsl:text>\usepackage{ulem} 
</xsl:text>
         <xsl:text>\usepackage{xfrac} 
</xsl:text>
         <xsl:if xmlns="http://transpect.io/xml2tex"
                 test="//*[@css:letter-spacing or exists(key('style', @role)/@css:letter-spacing)] and $letter-spacing-def[normalize-space()]">
            <xsl:value-of select="concat('\usepackage{', $letter-spacing-def,'}&#xA;')"/>
         </xsl:if>
         <xsl:text>\usepackage{arydshln} 
</xsl:text>
         <xsl:if xmlns="http://transpect.io/xml2tex"
                 test="//dbk:div[@role eq 'hub:index'][1]">
            <xsl:text>\usepackage{makeidx}
\makeindex
</xsl:text>
         </xsl:if>
         <xsl:sequence xmlns="http://transpect.io/xml2tex"
                       select="if(exists($langs))                            then string-join(xml2tex:langs-to-latex-pkg( $langs ), '&#xA;')                            else string-join(xml2tex:langs-to-latex-pkg( 'en' ), '&#xA;')"/>
         <xsl:text xmlns="http://transpect.io/xml2tex">
</xsl:text>
         <xsl:for-each xmlns="http://transpect.io/xml2tex"
                       select="xml2tex:rgb-to-tex-color( $colors )">
            <xsl:value-of select="concat('\define', ., '&#xA;')"/>
         </xsl:for-each>
         <xsl:text>
\begin{document}
</xsl:text>
         <xsl:next-match/>
         <xsl:text>
\end{document}
</xsl:text>
      </c:data>
   </xsl:template>
   <!--identity template-->
   <xsl:template match="@* | node()" mode="#all" priority="-10">
      <xsl:copy>
         <xsl:apply-templates select="@*, node()" mode="#current"/>
      </xsl:copy>
   </xsl:template>
   <!--template section-->
   <xsl:template match="text()[normalize-space()]                                  [matches(., $xml2tex:all-bad-chars-regex)]"
                 mode="escape-bad-chars">
      <xsl:variable name="content"
                    select="xml2tex:escape-for-tex(replace( ., '\\', '\\textbackslash ' ))"
                    as="xs:string"/>
      <xsl:value-of select="$content"/>
   </xsl:template>
   <xsl:template match="*" mode="xml2tex">
      <xsl:apply-templates mode="#current"/>
   </xsl:template>
   <xsl:template match="/dbk:hub/dbk:info" mode="xml2tex" priority="4"/>
   <xsl:template match="dbk:para[not(parent::*[local-name() = ('entry', 'th', 'td')])]                              [following-sibling::*[1][not(local-name() = ('orderedlist',                                                                            'itemizedlist',                                                                            'variablelist',                                                                            'figure',                                                                            'equation',                                                                            'dialogue',                                                                            'blockquote'))]]                              [not(parent::dbk:listitem) or (parent::dbk:listitem and following-sibling::*[1][self::dbk:para])]"
                 mode="xml2tex"
                 priority="5">
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="suppress-cca"
                 select="tr:suppress-structure(.)"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="already-structured"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of element()">
            <xsl:apply-templates select="if((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of node()) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())">
            <xsl:apply-templates select="if(not((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()">
            <xsl:apply-templates select="if((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of element()">
            <xsl:apply-templates select="if((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of node()) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())">
            <xsl:apply-templates select="if(not((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()">
            <xsl:apply-templates select="if((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="*[not(local-name() = $elements-where-pagebreaks-are-ignored)]                       [not(self::dbk:title and parent::dbk:info/parent::*/local-name() = $titles-where-pagebreaks-are-ignored)]                       [@css:page-break-before eq 'always' or key('style', @role)/@css:page-break-before eq 'always']"
                 mode="xml2tex"
                 priority="6">
      <xsl:if xmlns="http://transpect.io/xml2tex" test="$xerif">
         <xsl:text>\pagebreak
</xsl:text>
      </xsl:if>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
   </xsl:template>
   <xsl:template match="dbk:phrase[@role eq 'cr']" mode="xml2tex" priority="7">
      <xsl:text>\newline</xsl:text>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:br" mode="xml2tex" priority="8">
      <xsl:text>\newline</xsl:text>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:br[following-sibling::node()[1][self::dbk:br]]"
                 mode="xml2tex"
                 priority="9">
      <xsl:text>\newline</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:title/dbk:br" mode="xml2tex" priority="10">
      <xsl:text>\protect\newline</xsl:text>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:entry//dbk:br[not($xerif)]" mode="xml2tex" priority="11">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="' \newline '"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="html:td//dbk:br[$table-model eq 'htmltabs']"
                 mode="xml2tex"
                 priority="12">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="' \htCellBreak '"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:entry[not(@*:morerows) or @*:morerows eq '0']/dbk:para[not(parent::dbk:footnote)]                                                                                [following-sibling::dbk:para]//dbk:br[not($xerif)]"
                 mode="xml2tex"
                 priority="13">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="' \newline '"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:entry[not(@*:morerows) or @*:morerows eq '0']/dbk:para[not(parent::dbk:footnote)]                                                                                [following-sibling::dbk:para][not($xerif)]"
                 mode="xml2tex"
                 priority="14">
      <xsl:text/>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text/>
      <xsl:value-of select="' \newline '"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:entry//dbk:br[every $precedent in ancestor::dbk:para[1]//node()[. &lt;&lt; current()]                                         satisfies (not(normalize-space($precedent)))]"
                 mode="xml2tex"
                 priority="15">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'\leavevmode\newline&#xA;'"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [   (@css:letter-spacing and xs:double(replace(@css:letter-spacing, '[a-z]+$', '')) gt 0.5)                        or (exists(key('style', @role)[@css:letter-spacing[xs:double(replace(., '[a-z]+$', '')) gt 0.5]])                             and not(@css:letter-spacing[xs:double(replace(., '[a-z]+$', '')) le 0.5]))]"
                 mode="xml2tex"
                 priority="16">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="if ($letter-spacing-def = 'soul') then '\so{' else '\textls{'"/>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [   matches(@css:text-decoration-line, 'line-through')                        or exists(key('style', @role)[matches(@css:text-decoration-line, 'line-through')])]"
                 mode="xml2tex"
                 priority="17">
      <xsl:text xmlns="http://transpect.io/xml2tex">\sout{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [@css:text-decoration-line ne 'none' or not(@css:text-decoration-line)]                       [   (matches(@css:text-decoration-line, 'underline')                         or  exists(key('style', @role)[matches(@css:text-decoration-line, 'underline')]))]    [not(@role eq 'Hyperlink')]     [not(parent::dbk:link) and exists(..)(:if no root exists:)]    [not(.//dbk:link)]"
                 mode="xml2tex"
                 priority="18">
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="line-style"
                    select="(@css:text-decoration-style, key('style', @role)/@css:text-decoration-style)[1]"/>
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="if (matches($line-style,'dotted'))                           then '\dotuline{'                           else if (matches($line-style,'dashed'))                                then '\dashuline{'                                else if (matches($line-style,'double'))                                      then  '\uuline{'                                      else  '\uline{' "/>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[not(@css:font-style eq 'normal')]                              [@css:font-style eq 'italic'                               or exists(key('style', @role)[@css:font-style eq 'italic'])]                              [not(ancestor::dbk:info)]"
                 mode="xml2tex"
                 priority="19">
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="suppress-cca"
                 select="tr:suppress-structure(.)"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="already-structured"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:sequence xmlns="http://transpect.io/xml2tex"
                    select="tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]"/>
      <xsl:text>\textit</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:choose xmlns="http://transpect.io/xml2tex">
         <xsl:when test="parent::*[local-name() = ('entry', 'th', 'td')][not($xerif)]                         and following-sibling::*[1]">
            <xsl:text>\newline
</xsl:text>
         </xsl:when>
         <xsl:when test="not(   parent::dbk:footnote                             or (parent::dbk:listitem and not(following-sibling::*)))                         and following-sibling::*[1]">
            <xsl:text>

</xsl:text>
         </xsl:when>
      </xsl:choose>
      <xsl:text/>
      <xsl:sequence xmlns="http://transpect.io/xml2tex"
                    select="tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[not(@css:font-weight eq 'normal')]                              [@css:font-weight eq 'bold'                               or (    exists(key('style', @role)[@css:font-weight eq 'bold'])                                   and not(@css:font-weight eq 'normal'))]"
                 mode="xml2tex"
                 priority="20">
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="suppress-cca"
                 select="tr:suppress-structure(.)"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="already-structured"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:sequence xmlns="http://transpect.io/xml2tex"
                    select="tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]"/>
      <xsl:text>\textbf</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:choose xmlns="http://transpect.io/xml2tex">
         <xsl:when test="parent::*[local-name() = ('entry', 'th', 'td')][not($xerif)]                         and following-sibling::*[1]">
            <xsl:text>\newline
</xsl:text>
         </xsl:when>
         <xsl:when test="not(   parent::dbk:footnote                             or (parent::dbk:listitem and not(following-sibling::*)))                         and following-sibling::*[1]">
            <xsl:text>

</xsl:text>
         </xsl:when>
      </xsl:choose>
      <xsl:text/>
      <xsl:sequence xmlns="http://transpect.io/xml2tex"
                    select="tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]"/>
   </xsl:template>
   <xsl:template match="dbk:*[@css:display eq 'none']" mode="xml2tex" priority="21">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'&#xA;%'"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'&#xA;'"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:para[   @css:text-align='center'                               or exists(key('style', @role)[@css:text-align eq 'center'])]                              [not(parent::*/@css:text-align='center')]                              [not(@css:text-align = ('left', 'right', 'justify'))(:if centering is in style but overwritten:)]                              [not(parent::dbk:entry or parent::*:th or parent::*:td)]"
                 mode="xml2tex"
                 priority="22">
      <xsl:text xmlns="http://transpect.io/xml2tex">{\centering </xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">\par}</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[   @css:text-align='right'                               or exists(key('style', @role)[@css:text-align eq 'right'])]                              [not(parent::*/@css:text-align='right')]                              [not(@css:text-align = ('left', 'center', 'justify'))]                              [not(parent::dbk:entry or parent::*:th or parent::*:td)]"
                 mode="xml2tex"
                 priority="23">
      <xsl:text xmlns="http://transpect.io/xml2tex">{\raggedleft </xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">\par}</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[(    @css:text-align='left'                                and key('style', @role)/@css:text-align = ('center', 'right'))                               or (not(@css:text-align)                                   and parent::*[local-name() = ('td', 'th', 'entry')]                                   and following-sibling::*[1][@css:text-align[. ne 'left']])]                              [not(parent::*/@css:text-align='left')]                              [not(parent::dbk:entry or parent::*:th or parent::*:td)]"
                 mode="xml2tex"
                 priority="24">
      <xsl:text xmlns="http://transpect.io/xml2tex">{\raggedright </xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">\par}</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:phrase[(@css:top[. ne '0pt'], key('style', @role)/@css:top[. ne '0pt'])[1]]/text()"
                 mode="xml2tex"
                 priority="25">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')) instance of element()">
            <xsl:apply-templates select="if((if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')) instance of node()) then (if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')) instance of item())">
            <xsl:apply-templates select="if(not((if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')) instance of item())) then (if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')) instance of text()">
            <xsl:apply-templates select="if((if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')) instance of text()) then (if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="if(starts-with((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '-'))                     then concat('\raisebox{', replace((parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '^-', ''), '}')                     else concat('\raisebox{-', (parent::*/@css:top, key('style', parent::*/@role)/@css:top)[1], '}')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:table                     |dbk:informaltable"
                 mode="xml2tex"
                 priority="26">
      <xsl:text>
\begin{table}</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{table}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:figure/dbk:title|dbk:table/dbk:title"
                 mode="xml2tex"
                 priority="27">
      <xsl:text>
\caption</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:figure" mode="xml2tex" priority="28">
      <xsl:text>
\begin{figure}</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'&#xA;'"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')) instance of element()">
            <xsl:apply-templates select="if((concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')) instance of node()) then (concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')) instance of item())">
            <xsl:apply-templates select="if(not((concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')) instance of item())) then (concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')) instance of text()">
            <xsl:apply-templates select="if((concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')) instance of text()) then (concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="concat('\label{fig:', index-of(for $i in //dbk:figure return generate-id($i), generate-id(.)), '}')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{figure}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:alt" mode="xml2tex" priority="29"/>
   <xsl:template match="dbk:imagedata[@fileref]" mode="xml2tex" priority="30">
      <xsl:text>\includegraphics</xsl:text>
      <xsl:text>[</xsl:text>
      <xsl:choose>
         <xsl:when test="(concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')) instance of element()">
            <xsl:apply-templates select="if((concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')) instance of node()) then (concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="not((concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')) instance of item())">
            <xsl:apply-templates select="if(not((concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')) instance of item())) then (concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="(concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')) instance of text()">
            <xsl:apply-templates select="if((concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')) instance of text()) then (concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="concat('width=',                               if(ancestor::dbk:figure)                              then 1 div count(ancestor::dbk:figure[last()]//*[local-name() = ('mediaobject', 'inlinemediaobject')])                              else 1,                              '\textwidth')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>]</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(replace(@fileref, '([%#])', '\\$1')) instance of element()">
            <xsl:apply-templates select="if((replace(@fileref, '([%#])', '\\$1')) instance of node()) then (replace(@fileref, '([%#])', '\\$1')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((replace(@fileref, '([%#])', '\\$1')) instance of item())">
            <xsl:apply-templates select="if(not((replace(@fileref, '([%#])', '\\$1')) instance of item())) then (replace(@fileref, '([%#])', '\\$1')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(replace(@fileref, '([%#])', '\\$1')) instance of text()">
            <xsl:apply-templates select="if((replace(@fileref, '([%#])', '\\$1')) instance of text()) then (replace(@fileref, '([%#])', '\\$1')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="replace(@fileref, '([%#])', '\\$1')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="svg:svg" mode="xml2tex" priority="31">
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="svg-filename"
                    select="concat($basename, '-svg-', index-of($svg-images, .)[1], '.svg')"
                    as="xs:string"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="svg-path"
                    select="concat($path, '/', $svg-filename)"
                    as="xs:string"/>
      <xsl:text>\includegraphics</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="($svg-filename) instance of element()">
            <xsl:apply-templates select="if(($svg-filename) instance of node()) then ($svg-filename) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not(($svg-filename) instance of item())">
            <xsl:apply-templates select="if(not(($svg-filename) instance of item())) then ($svg-filename) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="($svg-filename) instance of text()">
            <xsl:apply-templates select="if(($svg-filename) instance of text()) then ($svg-filename) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="$svg-filename"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
      <c:data href="{$svg-path}"
              method="xml"
              content-type="text/plain"
              encoding="utf-8">
         <xsl:copy-of select="."/>
      </c:data>
   </xsl:template>
   <xsl:template match="dbk:link[@xlink:href][matches(@xlink:href, '^(https?|ftp):')]"
                 mode="xml2tex"
                 priority="32">
      <xsl:text>\href</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')) instance of element()">
            <xsl:apply-templates select="if((replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')) instance of node()) then (replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')) instance of item())">
            <xsl:apply-templates select="if(not((replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')) instance of item())) then (replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')) instance of text()">
            <xsl:apply-templates select="if((replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')) instance of text()) then (replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="replace((@xlink:href, @url)[1], '([%#_\\])', '\\$1')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:link[@xlink:href][matches(@xlink:href, '^(https?|ftp):')]                              [@xlink:href = replace(., '\\', '')]                     |dbk:ulink"
                 mode="xml2tex"
                 priority="33">
      <xsl:text>\url</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(replace((@xlink:href, @url)[1], '([%#])', '\\$1')) instance of element()">
            <xsl:apply-templates select="if((replace((@xlink:href, @url)[1], '([%#])', '\\$1')) instance of node()) then (replace((@xlink:href, @url)[1], '([%#])', '\\$1')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((replace((@xlink:href, @url)[1], '([%#])', '\\$1')) instance of item())">
            <xsl:apply-templates select="if(not((replace((@xlink:href, @url)[1], '([%#])', '\\$1')) instance of item())) then (replace((@xlink:href, @url)[1], '([%#])', '\\$1')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(replace((@xlink:href, @url)[1], '([%#])', '\\$1')) instance of text()">
            <xsl:apply-templates select="if((replace((@xlink:href, @url)[1], '([%#])', '\\$1')) instance of text()) then (replace((@xlink:href, @url)[1], '([%#])', '\\$1')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="replace((@xlink:href, @url)[1], '([%#])', '\\$1')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:link[@xlink:href][matches(@xlink:href, '^mailto:')]"
                 mode="xml2tex"
                 priority="34">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:blockquote" mode="xml2tex" priority="35">
      <xsl:text>
\begin{quote}</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{quote}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[not(parent::dbk:blockquote)][@role = ('Zitat', 'Quote')]"
                 mode="xml2tex"
                 priority="36">
      <xsl:text>
\begin{quote}</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{quote}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:blockquote[count(dbk:para) gt 1]"
                 mode="xml2tex"
                 priority="37">
      <xsl:text>
\begin{quotation}</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{quotation}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:itemizedlist" mode="xml2tex" priority="38">
      <xsl:text>
\begin{itemize}</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{itemize}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:listitem[not(parent::dbk:varlistentry)][empty(@override)]"
                 mode="xml2tex"
                 priority="39">
      <xsl:text>
\item</xsl:text>
      <xsl:if xmlns="http://transpect.io/xml2tex"
              test="    parent::dbk:itemizedlist/@mark                      and parent::dbk:itemizedlist/@mark != 'bullet'                     and not($xerif)">
         <xsl:text>[</xsl:text>
         <xsl:choose>
            <xsl:when test="(xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)) instance of element()">
               <xsl:apply-templates select="if((xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)) instance of node()) then (xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)) else node()"
                                    mode="#current">
                  <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
               </xsl:apply-templates>
            </xsl:when>
            <xsl:when test="not((xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)) instance of item())">
               <xsl:apply-templates select="if(not((xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)) instance of item())) then (xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)) else node()"
                                    mode="#current">
                  <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
               </xsl:apply-templates>
            </xsl:when>
            <xsl:when test="(xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)) instance of text()">
               <xsl:apply-templates select="if((xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)) instance of text()) then (xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)) else node()"
                                    mode="#current">
                  <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
               </xsl:apply-templates>
            </xsl:when>
            <xsl:otherwise>
               <xsl:value-of select="xml2tex:utf2tex((), parent::dbk:itemizedlist/@mark, $charmap, (), $texregex)"/>
            </xsl:otherwise>
         </xsl:choose>
         <xsl:text>]</xsl:text>
      </xsl:if>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="not($a11y)">
         <xsl:text/>
         <xsl:choose>
            <xsl:when test="(' ') instance of element()">
               <xsl:apply-templates select="if((' ') instance of node()) then (' ') else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="not((' ') instance of item())">
               <xsl:apply-templates select="if(not((' ') instance of item())) then (' ') else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="(' ') instance of text()">
               <xsl:apply-templates select="if((' ') instance of text()) then (' ') else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:otherwise>
               <xsl:value-of select="' '"/>
            </xsl:otherwise>
         </xsl:choose>
         <xsl:text/>
      </xsl:if>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:listitem[not(parent::dbk:varlistentry)][@override]"
                 mode="xml2tex"
                 priority="40">
      <xsl:text>
\item</xsl:text>
      <xsl:text>[</xsl:text>
      <xsl:choose>
         <xsl:when test="(@override) instance of element()">
            <xsl:apply-templates select="if((@override) instance of node()) then (@override) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="not((@override) instance of item())">
            <xsl:apply-templates select="if(not((@override) instance of item())) then (@override) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="(@override) instance of text()">
            <xsl:apply-templates select="if((@override) instance of text()) then (@override) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="@override"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>]</xsl:text>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="not($a11y)">
         <xsl:text/>
         <xsl:choose>
            <xsl:when test="(' ') instance of element()">
               <xsl:apply-templates select="if((' ') instance of node()) then (' ') else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="not((' ') instance of item())">
               <xsl:apply-templates select="if(not((' ') instance of item())) then (' ') else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="(' ') instance of text()">
               <xsl:apply-templates select="if((' ') instance of text()) then (' ') else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:otherwise>
               <xsl:value-of select="' '"/>
            </xsl:otherwise>
         </xsl:choose>
         <xsl:text/>
      </xsl:if>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:orderedlist/dbk:listitem" mode="xml2tex" priority="41">
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="level"
                    select="count(ancestor::*:orderedlist|ancestor::*:itemizedlist)"
                    as="xs:integer"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex" name="level-roman" as="xs:string">
         <xsl:number value="$level" format="i"/>
      </xsl:variable>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="pos"
                    select="count(preceding-sibling::*) + 1"
                    as="xs:integer"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="override"
                    select="@override"
                    as="attribute(override)?"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="numeration"
                    select="parent::*/@numeration"
                    as="attribute(numeration)?"/>
      <xsl:if xmlns="http://transpect.io/xml2tex"
              test="    $override                   and $numeration                   and not(  tr:list-number-to-integer($override, $numeration)                            - preceding-sibling::*[1]/tr:list-number-to-integer(@override, parent::*/@numeration)                           = 1 )                   and $pos ne 1">
         <xsl:value-of select="concat('&#xA;\setcounter{enum', $level-roman, '}{',                                     xs:string(                                                preceding-sibling::*[1]/tr:list-number-to-integer(@override, parent::*/@numeration)                                              + tr:list-number-to-integer($override, $numeration)                                              - preceding-sibling::*[1]/tr:list-number-to-integer(@override, parent::*/@numeration)                                              - 1),                                     '}&#xA;')"/>
      </xsl:if>
      <xsl:text>
\item</xsl:text>
      <xsl:if xmlns="http://transpect.io/xml2tex"
              test="matches(@override, '^[(\[{]?[a-z0-9]+(([a-z])|(\.([a-z0-9])+))[)\]}]?$')">
         <xsl:text>[</xsl:text>
         <xsl:choose>
            <xsl:when test="(@override) instance of element()">
               <xsl:apply-templates select="if((@override) instance of node()) then (@override) else node()"
                                    mode="#current">
                  <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
               </xsl:apply-templates>
            </xsl:when>
            <xsl:when test="not((@override) instance of item())">
               <xsl:apply-templates select="if(not((@override) instance of item())) then (@override) else node()"
                                    mode="#current">
                  <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
               </xsl:apply-templates>
            </xsl:when>
            <xsl:when test="(@override) instance of text()">
               <xsl:apply-templates select="if((@override) instance of text()) then (@override) else node()"
                                    mode="#current">
                  <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
               </xsl:apply-templates>
            </xsl:when>
            <xsl:otherwise>
               <xsl:value-of select="@override"/>
            </xsl:otherwise>
         </xsl:choose>
         <xsl:text>]</xsl:text>
      </xsl:if>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="not($a11y)">
         <xsl:text/>
         <xsl:choose>
            <xsl:when test="(' ') instance of element()">
               <xsl:apply-templates select="if((' ') instance of node()) then (' ') else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="not((' ') instance of item())">
               <xsl:apply-templates select="if(not((' ') instance of item())) then (' ') else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="(' ') instance of text()">
               <xsl:apply-templates select="if((' ') instance of text()) then (' ') else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:otherwise>
               <xsl:value-of select="' '"/>
            </xsl:otherwise>
         </xsl:choose>
         <xsl:text/>
      </xsl:if>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:variablelist" mode="xml2tex" priority="42">
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="max-length"
                    as="xs:integer"
                    select="max(dbk:varlistentry/dbk:term/string-length(replace(., '\{\\slash\}', '/')))"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="longest-word"
                    as="xs:string"
                    select="dbk:varlistentry[dbk:term[string-length(replace(., '\{\\slash\}', '/')) eq $max-length]][1]/dbk:term"/>
      <xsl:text>
\begin{description}</xsl:text>
      <xsl:text>[</xsl:text>
      <xsl:choose>
         <xsl:when test="($longest-word) instance of element()">
            <xsl:apply-templates select="if(($longest-word) instance of node()) then ($longest-word) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="not(($longest-word) instance of item())">
            <xsl:apply-templates select="if(not(($longest-word) instance of item())) then ($longest-word) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="($longest-word) instance of text()">
            <xsl:apply-templates select="if(($longest-word) instance of text()) then ($longest-word) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="$longest-word"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>]</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{description}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:term[parent::dbk:varlistentry]"
                 mode="xml2tex"
                 priority="43">
      <xsl:text>
\item</xsl:text>
      <xsl:text>[</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>]</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [@css:color or key('style', @role)/@css:color]                       [not(every $i in  tr:hex-rgb-color-to-ints((@css:color, key('style', @role)/@css:color)[1])                             satisfies $i &lt; 35)]                       [not(@role = ('ZFinlineequation', 'ZFequation', 'ZFVerweis', 'ZFCaption', 'NOTE-CE', 'NOTE-TS', 'Hyperlink'))]                       [not(preceding-sibling::*[@role = ('ZFinlineequation', 'ZFequation')])]                       [not(following-sibling::*[@role = ('ZFinlineequation', 'ZFequation')])]                       [not(ancestor-or-self::dbk:link)]"
                 mode="xml2tex"
                 priority="44">
      <xsl:text xmlns="http://transpect.io/xml2tex">\textcolor{</xsl:text>
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="for $color-code in (@css:color, key('style', parent::*/@role)/@css:color)[1]                            return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                                  then tr:color-hex-rgb-to-keyword($color-code)[1]                                  else concat('color-', upper-case(substring-after($color-code, '#')))"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [@css:font-style eq 'normal']                       [   exists(ancestor-or-self::*[@css:font-style = 'italic'][1])                        or (some $role in ancestor-or-self::*[@role]/@role                            satisfies exists(key('style', $role)[@css:font-style eq 'italic']))]"
                 mode="xml2tex"
                 priority="45">
      <xsl:text xmlns="http://transpect.io/xml2tex">\textup{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [@css:font-weight eq 'normal']                       [   exists(ancestor-or-self::*[@css:font-weight = 'bold'][1])                        or (some $role in ancestor-or-self::*[@role]/@role                            satisfies exists(key('style', $role)[@css:font-weight eq 'bold']))]"
                 mode="xml2tex"
                 priority="46">
      <xsl:text xmlns="http://transpect.io/xml2tex">\textnormal{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [   @css:font-style eq 'italic'                         or (    exists(key('style', @role)[@css:font-style eq 'italic'])                            and not(@css:font-style eq 'normal'))]"
                 mode="xml2tex"
                 priority="47">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="if (count(descendant::dbk:para) gt 1) then '{\itshape ' else '\textit{'"/>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [   @css:font-weight eq 'bold'                        or (    exists(key('style', @role)[@css:font-weight eq 'bold'])                            and not(@css:font-weight eq 'normal'))]"
                 mode="xml2tex"
                 priority="48">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="if (count(descendant::dbk:para) gt 1) then '{\bfseries ' else '\textbf{'"/>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [@css:font-style eq 'italic' or @css:font-weight eq 'bold']                       [matches(., '^[ΓΔΘΛΞΠΣΥΦΨ-ξπ-϶]$')]"
                 mode="xml2tex"
                 priority="49">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [   @css:font-family = ('Consolas', 'Courier New', 'Courier')                        or exists(key('style', @role)[@css:font-family = ('Consolas', 'Courier New', 'Courier')])]"
                 mode="xml2tex"
                 priority="50">
      <xsl:text xmlns="http://transpect.io/xml2tex">\texttt{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [    (@css:font-variant eq 'small-caps'                             or exists(key('style', @role)[@css:font-variant eq 'small-caps']))                        and not(@css:text-transform eq 'uppercase'                                or exists(key('style', @role)[@css:text-transform eq 'uppercase']))]"
                 mode="xml2tex"
                 priority="51">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="if (count(descendant::dbk:para) gt 1) then '{\scshape ' else '\textsc{'"/>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [not(@css:background-color eq '#FFFFFF')                                 and (@css:background-color                                  or exists(key('style', @role)[@css:background-color and not(@css:background-color eq '#FFFFFF') ]))]                                [not(.//dbk:footnote)]"
                 mode="xml2tex"
                 priority="52">
      <xsl:text>\colorbox</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))) instance of element()">
            <xsl:apply-templates select="if((for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))) instance of node()) then (for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))) instance of item())">
            <xsl:apply-templates select="if(not((for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))) instance of item())) then (for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))) instance of text()">
            <xsl:apply-templates select="if((for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))) instance of text()) then (for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="for $color-code in (@css:background-color, key('style', @role)/@css:background-color)[1]                       return if(exists(tr:color-hex-rgb-to-keyword($color-code)))                             then tr:color-hex-rgb-to-keyword($color-code)[1]                             else concat('color-', upper-case(substring-after($color-code, '#')))"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text xmlns="http://transpect.io/xml2tex">{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:subscript                     |dbk:phrase[not(dbk:footnote)]                                [not(parent::dbk:subscript)]                                [key('style', @role)[@remap eq 'subscript']]"
                 mode="xml2tex"
                 priority="53">
      <xsl:text xmlns="http://transpect.io/xml2tex">\textsubscript{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:superscript[not(dbk:footnote)]                     |dbk:phrase[not(dbk:footnote)]                                [not(parent::dbk:superscript)]                                [key('style', @role)[@remap eq 'superscript']]"
                 mode="xml2tex"
                 priority="54">
      <xsl:text xmlns="http://transpect.io/xml2tex">\textsuperscript{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[@docx2tex:config eq 'headline']/dbk:phrase[@role eq 'docx2tex:identifier']"
                 mode="xml2tex"
                 priority="55">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(' ') instance of element()">
            <xsl:apply-templates select="if((' ') instance of node()) then (' ') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((' ') instance of item())">
            <xsl:apply-templates select="if(not((' ') instance of item())) then (' ') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(' ') instance of text()">
            <xsl:apply-templates select="if((' ') instance of text()) then (' ') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="' '"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift1', 'headline1', 'heading1', 'Heading1')]"
                 mode="xml2tex"
                 priority="56">
      <xsl:text>\chapter</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift2', 'headline2', 'heading2', 'Heading2')]"
                 mode="xml2tex"
                 priority="57">
      <xsl:text>\section</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift3', 'headline3', 'heading3', 'Heading3')]"
                 mode="xml2tex"
                 priority="58">
      <xsl:text>\subsection</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift4', 'headline4', 'heading4', 'Heading4')]"
                 mode="xml2tex"
                 priority="59">
      <xsl:text>\subsubsection</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift5', 'headline5', 'heading5', 'Heading5')]"
                 mode="xml2tex"
                 priority="60">
      <xsl:text>\paragraph</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[matches(@role, '(berschrift|headline|heading)[6-9]', 'i')]"
                 mode="xml2tex"
                 priority="61">
      <xsl:text>\subparagraph</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:footnote" mode="xml2tex" priority="62">
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="pos"
                    as="xs:integer"
                    select="index-of($footnote-ids, (if (@xml:id) then @xml:id else generate-id()))"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="preceding-regular-fn-count"
                    as="xs:integer"
                    select="count(                                 for $i in (1 to $pos)                                  return $footnotes[$i][not(.//dbk:phrase[@role eq 'hub:identifier'][1][@xreflabel])]                                 )"/>
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select=".//dbk:phrase[@role eq 'hub:identifier'][1]                             /@xreflabel/concat('\renewcommand*{\thefootnote}{',                                                     if(matches(., '\*'))      then '\fnsymbol'                                                else if(matches(., 'ivxlcdm')) then '\roman'                                                else if(matches(., 'IVXLCDM')) then '\Roman'                                                else if(matches(., '[a-z]'))   then '\alph'                                                else if(matches(., '[A-Z]'))   then '\Alph'                                                else if(matches(., '[\*†‡§]')) then '\fnsymbol'                                                else                                '\arabic',                                                '{footnote}}')"/>
      <xsl:text>\footnote</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select=".//dbk:phrase[@role eq 'hub:identifier'][1]/@xreflabel/concat(                                                                                         '\renewcommand*{\thefootnote}{\arabic{footnote}}',                                                                                         '\setcounter{footnote}{',                                                                                         xs:string($preceding-regular-fn-count),                                                                                         '}'                                                                                         )"/>
   </xsl:template>
   <xsl:template match="dbk:informaltable//dbk:footnote                     |dbk:table//dbk:footnote"
                 mode="xml2tex"
                 priority="63">
      <xsl:text>\footnotemark</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(()) instance of element()">
            <xsl:apply-templates select="if((()) instance of node()) then (()) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((()) instance of item())">
            <xsl:apply-templates select="if(not((()) instance of item())) then (()) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(()) instance of text()">
            <xsl:apply-templates select="if((()) instance of text()) then (()) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="()"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:informaltable[.//dbk:footnote]                     |dbk:table[.//dbk:footnote]"
                 mode="xml2tex"
                 priority="64">
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:for-each xmlns="http://transpect.io/xml2tex" select=".//dbk:footnote">
         <xsl:value-of select="concat('\footnotetext[', index-of($footnotes, .), ']{')"/>
         <xsl:apply-templates mode="#current"/>
         <xsl:text>}
</xsl:text>
      </xsl:for-each>
   </xsl:template>
   <xsl:template match="dbk:footnote/dbk:para[following-sibling::dbk:para]"
                 mode="xml2tex"
                 priority="65">
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="suppress-cca"
                 select="tr:suppress-structure(.)"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="already-structured"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of element()">
            <xsl:apply-templates select="if((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of node()) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())">
            <xsl:apply-templates select="if(not((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()">
            <xsl:apply-templates select="if((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of element()">
            <xsl:apply-templates select="if((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of node()) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())">
            <xsl:apply-templates select="if(not((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()">
            <xsl:apply-templates select="if((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:footnote[count(*) eq 1]/dbk:para"
                 mode="xml2tex"
                 priority="66">
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="suppress-cca"
                 select="tr:suppress-structure(.)"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="already-structured"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of element()">
            <xsl:apply-templates select="if((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of node()) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())">
            <xsl:apply-templates select="if(not((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()">
            <xsl:apply-templates select="if((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of element()">
            <xsl:apply-templates select="if((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of node()) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())">
            <xsl:apply-templates select="if(not((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()">
            <xsl:apply-templates select="if((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:footnote/dbk:para[1]//text()[preceding-sibling::node()[1][@role eq 'hub:identifier']][starts-with(., ' ')]                     |dbk:footnote/dbk:para[1]//dbk:phrase[preceding-sibling::node()[1][@role eq 'hub:identifier']][starts-with(., ' ')]/text()[1]                     |dbk:footnote/dbk:para[1]/dbk:phrase[preceding-sibling::*[1][@role eq 'hub:identifier']]                                                         [preceding-sibling::node()[1][not(normalize-space())]]                                                         [starts-with(., ' ')]/text()[1]"
                 mode="xml2tex"
                 priority="67">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')) instance of element()">
            <xsl:apply-templates select="if((replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')) instance of node()) then (replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')) instance of item())">
            <xsl:apply-templates select="if(not((replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')) instance of item())) then (replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')) instance of text()">
            <xsl:apply-templates select="if((replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')) instance of text()) then (replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="replace(string-join(xml2tex:utf2tex(.., ., $charmap, (), $texregex), ''), '^\s', '')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:footnote/dbk:para[1]//text()[preceding-sibling::node()[1][@role eq 'hub:identifier']]                                                      [not(normalize-space())]"
                 mode="xml2tex"
                 priority="68"/>
   <xsl:template match="dbk:footnote//dbk:phrase[@role eq 'hub:separator']"
                 mode="xml2tex"
                 priority="69"/>
   <xsl:template match="dbk:footnote/dbk:para[1]/dbk:phrase[@role eq 'hub:identifier'][1]                                                         [not(descendant-or-self::dbk:anchor                                                               or descendant-or-self::processing-instruction())]                                                          //text()[1]"
                 mode="xml2tex"
                 priority="70">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="replace(., '^[\d*†‡§i\s]+\.?\s*', '', 'i')"/>
   </xsl:template>
   <xsl:template match="dbk:footnote/dbk:para/*[1][local-name() eq 'superscript'][matches(., '\d+')]"
                 mode="xml2tex"
                 priority="71"/>
   <xsl:template match="dbk:inlineequation[not(ancestor::dbk:superscript or ancestor::dbk:subscript )]                     |dbk:equation[ancestor::dbk:table or ancestor::dbk:informaltable]"
                 mode="xml2tex"
                 priority="72">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="('$') instance of element()">
            <xsl:apply-templates select="if(('$') instance of node()) then ('$') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not(('$') instance of item())">
            <xsl:apply-templates select="if(not(('$') instance of item())) then ('$') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="('$') instance of text()">
            <xsl:apply-templates select="if(('$') instance of text()) then ('$') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="'$'"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="('$') instance of element()">
            <xsl:apply-templates select="if(('$') instance of node()) then ('$') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not(('$') instance of item())">
            <xsl:apply-templates select="if(not(('$') instance of item())) then ('$') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="('$') instance of text()">
            <xsl:apply-templates select="if(('$') instance of text()) then ('$') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="'$'"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:equation[@condition eq 'numbered']                                  [not(ancestor::dbk:table or ancestor::dbk:informaltable)]"
                 mode="xml2tex"
                 priority="73">
      <xsl:text>
\begin{equation}</xsl:text>
      <xsl:text/>
      <xsl:value-of select="'&#xA;'"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{equation}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:equation[not(@condition eq 'numbered')]                                  [not(ancestor::dbk:table or ancestor::dbk:informaltable)]"
                 mode="xml2tex"
                 priority="74">
      <xsl:text>
\begin{equation*}</xsl:text>
      <xsl:text/>
      <xsl:value-of select="'&#xA;'"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{equation*}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:equation[@condition eq 'numbered'][not(ancestor::dbk:table or ancestor::dbk:informaltable)]                                  [not(some $i in processing-instruction() satisfies contains($i, '\begin{array}'))]                                  [some $i in processing-instruction() satisfies contains($i, '\\')]"
                 mode="xml2tex"
                 priority="75">
      <xsl:text>
\begin{align}</xsl:text>
      <xsl:text/>
      <xsl:value-of select="'&#xA;'"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{align}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:equation[not(@condition eq 'numbered')]                                  [not(ancestor::dbk:table or ancestor::dbk:informaltable)]                                  [not(some $i in processing-instruction() satisfies contains($i, '\begin{array}'))]                                  [some $i in processing-instruction() satisfies contains($i, '\\')]"
                 mode="xml2tex"
                 priority="76">
      <xsl:text>
\begin{align*}</xsl:text>
      <xsl:text/>
      <xsl:value-of select="'&#xA;'"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{align*}
</xsl:text>
   </xsl:template>
   <xsl:template match="processing-instruction('tr')[starts-with(., 'M2M_212')]"
                 mode="xml2tex"
                 priority="77">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'% D2T: Equation not converted. See log for details!&#xA;'"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="processing-instruction('d2t')[starts-with(., 'D2T 001')]"
                 mode="xml2tex"
                 priority="78">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'% D2T: Empty equation removed!&#xA;'"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:term/node()[1][self::dbk:tab]                     |dbk:tabs"
                 mode="xml2tex"
                 priority="79"/>
   <xsl:template match="dbk:tab                     |dbk:phrase[@role eq 'tab']"
                 mode="xml2tex"
                 priority="80">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'&#x9;'"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:tab[@xml:space eq 'preserve']                             [preceding-sibling::dbk:inlineequation and following-sibling::dbk:inlineequation]"
                 mode="xml2tex"
                 priority="81">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'{\quad}'"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:footnote//dbk:tab[@role eq 'hub:separator']"
                 mode="xml2tex"
                 priority="82"/>
   <xsl:template match="dbk:phrase[@role eq 'unicode-private-use']"
                 mode="xml2tex"
                 priority="83">
      <xsl:text>\privateuse</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:annotation" mode="xml2tex" priority="84">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))) instance of element()">
            <xsl:apply-templates select="if((concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))) instance of node()) then (concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))) instance of item())">
            <xsl:apply-templates select="if(not((concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))) instance of item())) then (concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))) instance of text()">
            <xsl:apply-templates select="if((concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))) instance of text()) then (concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="concat(if(parent::*/following-sibling::node()[1][self::text()][matches(., '^\s')])                            then ' '                            else '',                            '%', string-join(.//node(),                             ' '))"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('Inhaltsverzeichnisberschrift', 'TOC Heading')]"
                 mode="xml2tex"
                 priority="85">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(concat('\renewcommand{\contentsname}{', ., '}')) instance of element()">
            <xsl:apply-templates select="if((concat('\renewcommand{\contentsname}{', ., '}')) instance of node()) then (concat('\renewcommand{\contentsname}{', ., '}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((concat('\renewcommand{\contentsname}{', ., '}')) instance of item())">
            <xsl:apply-templates select="if(not((concat('\renewcommand{\contentsname}{', ., '}')) instance of item())) then (concat('\renewcommand{\contentsname}{', ., '}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(concat('\renewcommand{\contentsname}{', ., '}')) instance of text()">
            <xsl:apply-templates select="if((concat('\renewcommand{\contentsname}{', ., '}')) instance of text()) then (concat('\renewcommand{\contentsname}{', ., '}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="concat('\renewcommand{\contentsname}{', ., '}')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:div[@role eq 'hub:toc']" mode="xml2tex" priority="86">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'\tableofcontents'"/>
      <xsl:text/>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:indexterm[not(@type)]" mode="xml2tex" priority="87">
      <xsl:text>\index</xsl:text>
      <xsl:call-template xmlns="http://transpect.io/xml2tex" name="index-content"/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:indexterm[@type]" mode="xml2tex" priority="88">
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="as-option"
                 as="xs:boolean?"
                 tunnel="yes"/>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="$as-option">
         <xsl:text>{</xsl:text>
      </xsl:if>
      <xsl:text>\index</xsl:text>
      <xsl:text>[</xsl:text>
      <xsl:choose>
         <xsl:when test="(@type) instance of element()">
            <xsl:apply-templates select="if((@type) instance of node()) then (@type) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="not((@type) instance of item())">
            <xsl:apply-templates select="if(not((@type) instance of item())) then (@type) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="(@type) instance of text()">
            <xsl:apply-templates select="if((@type) instance of text()) then (@type) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="@type"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>]</xsl:text>
      <xsl:call-template xmlns="http://transpect.io/xml2tex" name="index-content"/>
      <xsl:text/>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="$as-option">
         <xsl:text>}</xsl:text>
      </xsl:if>
   </xsl:template>
   <xsl:template match="dbk:indexterm[not(normalize-space())][not(@class)]"
                 mode="xml2tex"
                 priority="89"/>
   <xsl:template match="dbk:primary" mode="xml2tex" priority="90">
      <xsl:text/>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="@sortas[normalize-space()]">
         <xsl:text/>
         <xsl:choose>
            <xsl:when test="(concat(@sortas, '@')) instance of element()">
               <xsl:apply-templates select="if((concat(@sortas, '@')) instance of node()) then (concat(@sortas, '@')) else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="not((concat(@sortas, '@')) instance of item())">
               <xsl:apply-templates select="if(not((concat(@sortas, '@')) instance of item())) then (concat(@sortas, '@')) else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="(concat(@sortas, '@')) instance of text()">
               <xsl:apply-templates select="if((concat(@sortas, '@')) instance of text()) then (concat(@sortas, '@')) else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:otherwise>
               <xsl:value-of select="concat(@sortas, '@')"/>
            </xsl:otherwise>
         </xsl:choose>
         <xsl:text/>
      </xsl:if>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="*[local-name() = ('primary',                                         'secondary',                                         'tertiary',                                         'quaternary',                                         'quinary',                                         'senary',                                         'septenary',                                         'octonary',                                         'nonary',                                         'denary')]                       [@css:font-weight eq 'bold'                        or (    exists(key('style', @role)[@css:font-weight eq 'bold'])                            and not(@css:font-weight eq 'normal'))]"
                 mode="xml2tex"
                 priority="91">
      <xsl:text xmlns="http://transpect.io/xml2tex">\textbf{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="*[local-name() = ('primary',                                         'secondary',                                         'tertiary',                                         'quaternary',                                         'quinary',                                         'senary',                                         'septenary',                                         'octonary',                                         'nonary',                                         'denary')]                       [@css:font-style eq 'italic'                        or exists(key('style', @role)[@css:font-style eq 'italic'])]"
                 mode="xml2tex"
                 priority="92">
      <xsl:text xmlns="http://transpect.io/xml2tex">\textit{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:secondary                     |dbk:tertiary                     |dbk:quaternary                     |dbk:quinary                     |dbk:senary                     |dbk:septenary                     |dbk:octonary                     |dbk:nonary                     |dbk:denary"
                 mode="xml2tex"
                 priority="93">
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'!'"/>
      <xsl:text/>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="@sortas[normalize-space()]">
         <xsl:text/>
         <xsl:choose>
            <xsl:when test="(concat(@sortas, '@')) instance of element()">
               <xsl:apply-templates select="if((concat(@sortas, '@')) instance of node()) then (concat(@sortas, '@')) else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="not((concat(@sortas, '@')) instance of item())">
               <xsl:apply-templates select="if(not((concat(@sortas, '@')) instance of item())) then (concat(@sortas, '@')) else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:when test="(concat(@sortas, '@')) instance of text()">
               <xsl:apply-templates select="if((concat(@sortas, '@')) instance of text()) then (concat(@sortas, '@')) else node()"
                                    mode="#current"/>
            </xsl:when>
            <xsl:otherwise>
               <xsl:value-of select="concat(@sortas, '@')"/>
            </xsl:otherwise>
         </xsl:choose>
         <xsl:text/>
      </xsl:if>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:see|dbk:seealso" mode="xml2tex" priority="94">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{') instance of element()">
            <xsl:apply-templates select="if((if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{') instance of node()) then (if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{') instance of item())">
            <xsl:apply-templates select="if(not((if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{') instance of item())) then (if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{') instance of text()">
            <xsl:apply-templates select="if((if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{') instance of text()) then (if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="if(   matches(string-join(dbk:phrase[@css:font-style eq 'italic'], ' '), $see-also-regex)                        or self::dbk:seealso)                      then '|seealso{'                       else '|see{'"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(node() except node()[matches(., $see-also-regex)]) instance of element()">
            <xsl:apply-templates select="if((node() except node()[matches(., $see-also-regex)]) instance of node()) then (node() except node()[matches(., $see-also-regex)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((node() except node()[matches(., $see-also-regex)]) instance of item())">
            <xsl:apply-templates select="if(not((node() except node()[matches(., $see-also-regex)]) instance of item())) then (node() except node()[matches(., $see-also-regex)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(node() except node()[matches(., $see-also-regex)]) instance of text()">
            <xsl:apply-templates select="if((node() except node()[matches(., $see-also-regex)]) instance of text()) then (node() except node()[matches(., $see-also-regex)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="node() except node()[matches(., $see-also-regex)]"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'}'"/>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="*[local-name() = ('see', 'seealso')]/dbk:phrase[@css:font-style eq 'italic']                                                                     [matches(., $see-regex) or matches(., $see-also-regex)]                     |*[local-name() = ('see', 'seealso')]/text()[matches(., $see-regex) or matches(., $see-also-regex)]"
                 mode="xml2tex"
                 priority="95">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="replace(replace(., '!', '&#34;!'),                                    $see-regex,                                    '$2',                                    'i')"/>
   </xsl:template>
   <xsl:template match="*[local-name() = ('see', 'seealso')]/text()[preceding-sibling::node()[1][self::dbk:phrase[@css:font-style eq 'italic']]                                                                                              [matches(., $see-regex) or matches(., $see-also-regex)]]"
                 mode="xml2tex"
                 priority="96">
      <xsl:value-of xmlns="http://transpect.io/xml2tex" select="replace(., '^\s+', '')"/>
   </xsl:template>
   <xsl:template match="*[local-name() = ('see', 'seealso')]/text()[preceding-sibling::*[1][self::dbk:phrase[@css:font-style eq 'italic'][matches(., $see-regex)]]]"
                 mode="xml2tex"
                 priority="97">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="replace(replace(., '!', '&#34;!'), '^\p{Zs}+', '')"/>
   </xsl:template>
   <xsl:template match="*[local-name() = ('primary',                                         'secondary',                                         'tertiary',                                         'quaternary',                                         'quinary',                                         'senary',                                         'septenary',                                         'octonary',                                         'nonary',                                         'denary')]//text()[matches(., '[|!@&#34;]')]"
                 mode="xml2tex"
                 priority="98">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')) instance of element()">
            <xsl:apply-templates select="if((replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')) instance of node()) then (replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')) instance of item())">
            <xsl:apply-templates select="if(not((replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')) instance of item())) then (replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')) instance of text()">
            <xsl:apply-templates select="if((replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')) instance of text()) then (replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="replace(replace(., '([!@&#34;])', '&#34;$1'),                             '\|',                             '\\textbar{}')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:index[not(.//dbk:indexentry)]"
                 mode="xml2tex"
                 priority="99">
      <xsl:text>\printindex</xsl:text>
      <xsl:text>[</xsl:text>
      <xsl:choose>
         <xsl:when test="(@remap) instance of element()">
            <xsl:apply-templates select="if((@remap) instance of node()) then (@remap) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="not((@remap) instance of item())">
            <xsl:apply-templates select="if(not((@remap) instance of item())) then (@remap) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="(@remap) instance of text()">
            <xsl:apply-templates select="if((@remap) instance of text()) then (@remap) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="@remap"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>]</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(concat('%%%', @remap)) instance of element()">
            <xsl:apply-templates select="if((concat('%%%', @remap)) instance of node()) then (concat('%%%', @remap)) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((concat('%%%', @remap)) instance of item())">
            <xsl:apply-templates select="if(not((concat('%%%', @remap)) instance of item())) then (concat('%%%', @remap)) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(concat('%%%', @remap)) instance of text()">
            <xsl:apply-templates select="if((concat('%%%', @remap)) instance of text()) then (concat('%%%', @remap)) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="concat('%%%', @remap)"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:index[.//dbk:indexentry]" mode="xml2tex" priority="100">
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="index-path"
                    as="xs:string"
                    select="concat($path, '/', $basename, '.', @remap/concat(., '_'), 'ind')"/>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="dbk:title and not(@remap)">
         <xsl:value-of select="concat('\renewcommand{\indexname}{', dbk:title, '}&#xA;')"/>
      </xsl:if>
      <xsl:text>\printindex</xsl:text>
      <xsl:text>[</xsl:text>
      <xsl:choose>
         <xsl:when test="(@remap) instance of element()">
            <xsl:apply-templates select="if((@remap) instance of node()) then (@remap) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="not((@remap) instance of item())">
            <xsl:apply-templates select="if(not((@remap) instance of item())) then (@remap) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="(@remap) instance of text()">
            <xsl:apply-templates select="if((@remap) instance of text()) then (@remap) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="@remap"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>]</xsl:text>
      <xsl:text>
</xsl:text>
      <c:data href="{$index-path}"
              method="text"
              content-type="text/plain"
              encoding="utf-8">
         <xsl:apply-templates mode="#current"/>
      </c:data>
   </xsl:template>
   <xsl:template match="dbk:index[.//dbk:indexentry]/node()"
                 mode="xml2tex"
                 priority="101">
      <xsl:apply-templates xmlns="http://transpect.io/xml2tex" mode="#current"/>
   </xsl:template>
   <xsl:template match="dbk:index[.//dbk:indexentry]/dbk:title | dbk:index/dbk:info"
                 mode="xml2tex"
                 priority="102"/>
   <xsl:template match="dbk:index[.//dbk:indexentry]//dbk:indexdiv"
                 mode="xml2tex"
                 priority="103">
      <xsl:if xmlns="http://transpect.io/xml2tex"
              test="not(preceding-sibling::dbk:indexdiv)">
         <xsl:value-of select="string-join(('\begin{theindex}',                                          '  \providecommand*\lettergroupDefault[1]{}',                                          '  \providecommand*\lettergroup[1]{%',                                          '    \par\textbf{#1}\par',                                          '    \nopagebreak',                                          '  }'),                                          '&#xA;')"/>
      </xsl:if>
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="concat('&#xA;  \indexspace&#xA;&#xA;  \lettergroup{', dbk:title, '}\nopagebreak&#xA;&#xA;')"/>
      <xsl:apply-templates xmlns="http://transpect.io/xml2tex"
                           select="dbk:indexentry"
                           mode="#current"/>
      <xsl:if xmlns="http://transpect.io/xml2tex"
              test="not(following-sibling::dbk:indexdiv)">
         <xsl:text>\end{theindex}</xsl:text>
      </xsl:if>
   </xsl:template>
   <xsl:template match="dbk:indexentry/dbk:primaryie" mode="xml2tex" priority="104">
      <xsl:text xmlns="http://transpect.io/xml2tex">  </xsl:text>
      <xsl:text>\item</xsl:text>
      <xsl:text/>
      <xsl:value-of select="' '"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:indexentry/dbk:secondaryie"
                 mode="xml2tex"
                 priority="105">
      <xsl:text xmlns="http://transpect.io/xml2tex">  </xsl:text>
      <xsl:text>\subitem</xsl:text>
      <xsl:text/>
      <xsl:value-of select="' '"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:indexentry/dbk:tertiaryie" mode="xml2tex" priority="106">
      <xsl:text xmlns="http://transpect.io/xml2tex">  </xsl:text>
      <xsl:text>\subsubitem</xsl:text>
      <xsl:text/>
      <xsl:value-of select="' '"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:indexentry/dbk:quaternaryie                     |dbk:indexentry/dbk:quinaryie                     |dbk:indexentry/dbk:senaryie                     |dbk:indexentry/dbk:septenaryie                     |dbk:indexentry/dbk:octonaryie                     |dbk:indexentry/dbk:nonaryie                     |dbk:indexentry/dbk:denaryie"
                 mode="xml2tex"
                 priority="107">
      <xsl:text xmlns="http://transpect.io/xml2tex">  </xsl:text>
      <xsl:text>\subsubsubitem</xsl:text>
      <xsl:text/>
      <xsl:value-of select="' '"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:seeie" mode="xml2tex" priority="108">
      <xsl:text>\see</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(()) instance of element()">
            <xsl:apply-templates select="if((()) instance of node()) then (()) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((()) instance of item())">
            <xsl:apply-templates select="if(not((()) instance of item())) then (()) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(()) instance of text()">
            <xsl:apply-templates select="if((()) instance of text()) then (()) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="()"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:seealsoie" mode="xml2tex" priority="109">
      <xsl:text>\seealso</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(()) instance of element()">
            <xsl:apply-templates select="if((()) instance of node()) then (()) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((()) instance of item())">
            <xsl:apply-templates select="if(not((()) instance of item())) then (()) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(()) instance of text()">
            <xsl:apply-templates select="if((()) instance of text()) then (()) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="()"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:indexentry//dbk:xref                     |dbk:seeie//dbk:xref                     |dbk:seealsoie//dbk:xref"
                 mode="xml2tex"
                 priority="110">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(replace(@xlink:href, '^page-', '')) instance of element()">
            <xsl:apply-templates select="if((replace(@xlink:href, '^page-', '')) instance of node()) then (replace(@xlink:href, '^page-', '')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((replace(@xlink:href, '^page-', '')) instance of item())">
            <xsl:apply-templates select="if(not((replace(@xlink:href, '^page-', '')) instance of item())) then (replace(@xlink:href, '^page-', '')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(replace(@xlink:href, '^page-', '')) instance of text()">
            <xsl:apply-templates select="if((replace(@xlink:href, '^page-', '')) instance of text()) then (replace(@xlink:href, '^page-', '')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="replace(@xlink:href, '^page-', '')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('Index_Heading', 'Indexberschrift')]"
                 mode="xml2tex"
                 priority="111"/>
   <xsl:template match="dbk:div[@role eq 'hub:index']" mode="xml2tex" priority="112">
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex') instance of element()">
            <xsl:apply-templates select="if((if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex') instance of node()) then (if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex') instance of item())">
            <xsl:apply-templates select="if(not((if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex') instance of item())) then (if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex') instance of text()">
            <xsl:apply-templates select="if((if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex') instance of text()) then (if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex') else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="if(//dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0])                      then concat('\renewcommand{\indexname}{',                                  //dbk:para[@role = ('Index_Heading', 'Indexberschrift')][string-length() gt 0][1],                                  '}&#xA;\printindex')                     else '\printindex'"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:sidebar" mode="xml2tex" priority="113">
      <xsl:text>
</xsl:text>
      <xsl:text/>
      <xsl:value-of select="'\fbox{\begin{minipage}[t]{0.8\textwidth}'"/>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:value-of select="'\end{minipage}}'"/>
      <xsl:text/>
      <xsl:text>

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:phrase[@xml:lang]                                [normalize-space(.)]                                [xml2tex:lang-to-babel-lang(@xml:lang)]                                [not(parent::dbk:link)]                                [every $lang in @xml:lang                                 satisfies not(ancestor::*[@xml:lang][1]/@xml:lang = $lang)]                                [not(ancestor::*[self::dbk:entry|self::dbk:term|self::dbk:div[@role = 'transcription']])]                                [not((*/local-name() = ('link', 'mediaobject', 'inlinemediaobject'))                                     and                                      not(normalize-space(string-join(.//text()[not(ancestor::*/local-name() = ('link', 'mediaobject', 'inlinemediaobject'))], '')))                                    )]"
                 mode="xml2tex"
                 priority="114">
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="suppress-foreign-lang"
                 as="xs:boolean?"
                 tunnel="yes"/>
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="protect-lang"
                 as="xs:boolean?"
                 tunnel="yes"
                 select="false()"/>
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="if ($suppress-foreign-lang)                            then ()                            else concat('\protect'[$protect-lang], '\foreignlanguage{', xml2tex:lang-to-babel-lang(@xml:lang), '}{')"/>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="if ($suppress-foreign-lang)                            then ()                           else '}'"/>
   </xsl:template>
   <xsl:template match="*[local-name() = $text-style-elements]                       [@css:text-transform eq 'uppercase'                        or exists(key('style', @role)[@css:text-transform eq 'uppercase'])]"
                 mode="xml2tex"
                 priority="115">
      <xsl:text xmlns="http://transpect.io/xml2tex">\uppercase{</xsl:text>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:para[xml2tex:lang-to-babel-lang(@xml:lang)[normalize-space()]]                              [not(@xml:lang = $langs[1])]"
                 mode="xml2tex"
                 priority="1000">
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="suppress-select-lang"
                 as="xs:boolean"
                 select="false()"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="protect-lang"
                    as="xs:boolean"
                    select="ancestor::dbk:title or ancestor::dbk:caption or ancestor::dbk:legalnotice"/>
      <xsl:if xmlns="http://transpect.io/xml2tex"
              test="not($suppress-select-lang) and not(preceding-sibling::*[1]/@xml:lang = current()/@xml:lang)">
         <xsl:value-of select="concat('\protect'[$protect-lang],'\selectlanguage{', xml2tex:lang-to-babel-lang(@xml:lang), '}%&#xA;')"/>
      </xsl:if>
      <xsl:next-match xmlns="http://transpect.io/xml2tex"/>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="not($suppress-select-lang)">
         <xsl:if test="not(parent::dbk:footnote)                      and                      (not(following-sibling::*[1]/@xml:lang = current()/@xml:lang) or following-sibling::*[1][self::dbk:bibliomixed])">
            <xsl:value-of select="concat('\selectlanguage{', xml2tex:lang-to-babel-lang($langs[1]), '}')"/>
         </xsl:if>
      </xsl:if>
   </xsl:template>
   <xsl:template match="dbk:bibliography" mode="xml2tex" priority="117">
      <xsl:text>
\begin{thebibliography}</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:value-of select="'0'"/>
      <xsl:text>}</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{thebibliography}

</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:bibliodiv" mode="xml2tex" priority="118">
      <xsl:text>
\begin{bibsect}</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(dbk:title) instance of element()">
            <xsl:apply-templates select="if((dbk:title) instance of node()) then (dbk:title) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((dbk:title) instance of item())">
            <xsl:apply-templates select="if(not((dbk:title) instance of item())) then (dbk:title) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(dbk:title) instance of text()">
            <xsl:apply-templates select="if((dbk:title) instance of text()) then (dbk:title) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="dbk:title"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(node() except dbk:title) instance of element()">
            <xsl:apply-templates select="if((node() except dbk:title) instance of node()) then (node() except dbk:title) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((node() except dbk:title) instance of item())">
            <xsl:apply-templates select="if(not((node() except dbk:title) instance of item())) then (node() except dbk:title) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(node() except dbk:title) instance of text()">
            <xsl:apply-templates select="if((node() except dbk:title) instance of text()) then (node() except dbk:title) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="node() except dbk:title"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text>
\end{bibsect}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:bibliomixed" mode="xml2tex" priority="119">
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="suppress-cca"
                 select="tr:suppress-structure(.)"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:param xmlns="http://transpect.io/xml2tex"
                 name="already-structured"
                 tunnel="yes"
                 as="xs:boolean?"/>
      <xsl:text>
\bibitem</xsl:text>
      <xsl:text>[</xsl:text>
      <xsl:choose>
         <xsl:when test="(concat('bib-', position())) instance of element()">
            <xsl:apply-templates select="if((concat('bib-', position())) instance of node()) then (concat('bib-', position())) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="not((concat('bib-', position())) instance of item())">
            <xsl:apply-templates select="if(not((concat('bib-', position())) instance of item())) then (concat('bib-', position())) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:when test="(concat('bib-', position())) instance of text()">
            <xsl:apply-templates select="if((concat('bib-', position())) instance of text()) then (concat('bib-', position())) else node()"
                                 mode="#current">
               <xsl:with-param name="as-option" select="true()" tunnel="yes" as="xs:boolean"/>
            </xsl:apply-templates>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="concat('bib-', position())"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>]</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(@xreflabel) instance of element()">
            <xsl:apply-templates select="if((@xreflabel) instance of node()) then (@xreflabel) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((@xreflabel) instance of item())">
            <xsl:apply-templates select="if(not((@xreflabel) instance of item())) then (@xreflabel) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(@xreflabel) instance of text()">
            <xsl:apply-templates select="if((@xreflabel) instance of text()) then (@xreflabel) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="@xreflabel"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of element()">
            <xsl:apply-templates select="if((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of node()) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())">
            <xsl:apply-templates select="if(not((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()">
            <xsl:apply-templates select="if((tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()) then (tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="tr:add-cca('Start', 'P')[not($suppress-cca) and not($already-structured)]"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(.) instance of element()">
            <xsl:apply-templates mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
      <xsl:choose>
         <xsl:when test="(tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of element()">
            <xsl:apply-templates select="if((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of node()) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())">
            <xsl:apply-templates select="if(not((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of item())) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()">
            <xsl:apply-templates select="if((tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) instance of text()) then (tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="tr:add-cca('End', 'P')[not($suppress-cca) and not($already-structured)]"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text/>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:biblioref                     |dbk:citation"
                 mode="xml2tex"
                 priority="120">
      <xsl:text>\cite</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')) instance of element()">
            <xsl:apply-templates select="if((string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')) instance of node()) then (string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')) instance of item())">
            <xsl:apply-templates select="if(not((string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')) instance of item())) then (string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')) instance of text()">
            <xsl:apply-templates select="if((string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')) instance of text()) then (string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="string-join(tokenize((@linkends, @linkend)[1], '\s'), ',')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text/>
   </xsl:template>
   <xsl:template match="dbk:bibliography[@role = ('Citavi', 'CSL')]"
                 mode="xml2tex"
                 priority="121">
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="bibtex-path"
                    select="concat($path, '/', $basename, '-bibtex.bib')"
                    as="xs:string"/>
      <xsl:text>

\bibliography</xsl:text>
      <xsl:text>{</xsl:text>
      <xsl:choose>
         <xsl:when test="(concat($basename, '-bibtex')) instance of element()">
            <xsl:apply-templates select="if((concat($basename, '-bibtex')) instance of node()) then (concat($basename, '-bibtex')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="not((concat($basename, '-bibtex')) instance of item())">
            <xsl:apply-templates select="if(not((concat($basename, '-bibtex')) instance of item())) then (concat($basename, '-bibtex')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:when test="(concat($basename, '-bibtex')) instance of text()">
            <xsl:apply-templates select="if((concat($basename, '-bibtex')) instance of text()) then (concat($basename, '-bibtex')) else node()"
                                 mode="#current"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="concat($basename, '-bibtex')"/>
         </xsl:otherwise>
      </xsl:choose>
      <xsl:text>}</xsl:text>
      <xsl:text>

</xsl:text>
      <c:data href="{$bibtex-path}"
              method="text"
              content-type="text/plain"
              encoding="utf-8">
         <xsl:apply-templates mode="#current"/>
      </c:data>
   </xsl:template>
   <xsl:template match="dbk:bibliography/dbk:biblioentry"
                 mode="xml2tex"
                 priority="122">
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="main-set"
                    as="element(dbk:biblioset)"
                    select="(dbk:biblioset[@relation eq 'article'], dbk:biblioset[@relation eq 'inproceedings'], dbk:biblioset)[1]"/>
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="concat('@',                                   if(matches($main-set/@relation, 'thesis'))                                     then 'phdthesis'                                  else if(matches($main-set/@relation, 'broadcast'))                                     then 'misc'                                  else if($main-set/@relation) then $main-set/@relation                                  else 'misc',                                   '{',                                  @xml:id,                                  ',&#xA;')"/>
      <xsl:apply-templates xmlns="http://transpect.io/xml2tex" mode="#current"/>
      <xsl:text xmlns="http://transpect.io/xml2tex">}
</xsl:text>
   </xsl:template>
   <xsl:template match="dbk:biblioentry[dbk:biblioset[@relation eq 'article']]/dbk:biblioset[@relation = ('journal', 'incollection', 'inproceedings')]"
                 mode="xml2tex"
                 priority="123">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="concat('journal={', ' ', dbk:title, '},&#xA;')"/>
   </xsl:template>
   <xsl:template match="dbk:biblioset/*" mode="xml2tex" priority="124"/>
   <xsl:template match="dbk:authorgroup" mode="xml2tex" priority="125">
      <xsl:text xmlns="http://transpect.io/xml2tex">author={</xsl:text>
      <xsl:for-each xmlns="http://transpect.io/xml2tex" select="dbk:author">
         <xsl:apply-templates mode="#current"/>
         <xsl:if test="position() ne last()">
            <xsl:text> and </xsl:text>
         </xsl:if>
      </xsl:for-each>
      <xsl:text xmlns="http://transpect.io/xml2tex">},
</xsl:text>
      <xsl:if xmlns="http://transpect.io/xml2tex" test="dbk:editor">
         <xsl:text>editor={</xsl:text>
         <xsl:for-each select="dbk:editor">
            <xsl:apply-templates mode="#current"/>
            <xsl:if test="position() ne last()">
               <xsl:text> and </xsl:text>
            </xsl:if>
         </xsl:for-each>
         <xsl:text>},
</xsl:text>
      </xsl:if>
   </xsl:template>
   <xsl:template match="dbk:biblioentry//dbk:personname"
                 mode="xml2tex"
                 priority="126">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="string-join((dbk:firstname, dbk:othername[starts-with(@role, 'middle')], dbk:surname), ' ')"/>
   </xsl:template>
   <xsl:template match="dbk:biblioentry//dbk:author                     |dbk:biblioentry//dbk:editor"
                 mode="xml2tex"
                 priority="127">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="concat(dbk:personname/dbk:firstname, ' ', dbk:personname/dbk:surname)"/>
   </xsl:template>
   <xsl:template match="dbk:biblioentry//dbk:pubdate" mode="xml2tex" priority="128">
      <xsl:value-of xmlns="http://transpect.io/xml2tex" select="concat('date={', ., '},&#xA;')"/>
   </xsl:template>
   <xsl:template match="dbk:biblioentry//dbk:publisher"
                 mode="xml2tex"
                 priority="129">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="concat('publisher={', dbk:publishername[1], '},&#xA;')"/>
   </xsl:template>
   <xsl:template match="dbk:biblioentry//dbk:pagenums" mode="xml2tex" priority="130">
      <xsl:value-of xmlns="http://transpect.io/xml2tex" select="concat('pages={', ., '},&#xA;')"/>
   </xsl:template>
   <xsl:template match="dbk:biblioentry//dbk:volumenum"
                 mode="xml2tex"
                 priority="131">
      <xsl:value-of xmlns="http://transpect.io/xml2tex" select="concat('number={', ., '},&#xA;')"/>
   </xsl:template>
   <xsl:template match="dbk:biblioentry//dbk:biblioset[not(following-sibling::dbk:biblioset[@relation = 'inproceedings'])]/dbk:title"
                 mode="xml2tex"
                 priority="132">
      <xsl:value-of xmlns="http://transpect.io/xml2tex" select="concat('title={', ., '},&#xA;')"/>
   </xsl:template>
   <xsl:template match="dbk:biblioentry/dbk:biblioset[following-sibling::dbk:biblioset[@relation = 'inproceedings']]/dbk:title"
                 mode="xml2tex"
                 priority="133">
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="concat('booktitle={', ., '},&#xA;')"/>
   </xsl:template>
   <xsl:template match="dbk:biblioentry//dbk:biblioid" mode="xml2tex" priority="134">
      <xsl:value-of xmlns="http://transpect.io/xml2tex" select="concat(@class, '={', ., '},&#xA;')"/>
   </xsl:template>
   <xsl:template match="dbk:orderedlist" mode="xml2tex" priority="135">
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="list-type"
                    as="xs:string?"
                    select="tr:enumerate-list-type((@numeration, 'arabic')[1], *:listitem[1]/@override)"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="override"
                    as="xs:string?"
                    select="(*:listitem[1],                             *:listitem[1]/*:orderedlist[1]/*:listitem[1])[string-length(@override) gt 0][1]/@override"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="start"
                    as="xs:integer"
                    select="if(string-length($override) gt 0 and @numeration)                            then tr:list-number-to-integer($override, @numeration) - 1                           else 0"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex"
                    name="level"
                    select="count(ancestor::*:orderedlist|ancestor::*:itemizedlist) + 1"
                    as="xs:integer"/>
      <xsl:variable xmlns="http://transpect.io/xml2tex" name="level-roman" as="xs:string">
         <xsl:number value="$level" format="i"/>
      </xsl:variable>
      <xsl:value-of xmlns="http://transpect.io/xml2tex"
                    select="concat('&#xA;\begin{enumerate}',                                  $list-type[not(matches(., '^\[\{\d+\.\}\]$'))],                                  concat('&#xA;\setcounter{enum',                                          $level-roman,                                          '}{',                                          $start,                                          '}')[$start gt 0]                                  )"/>
      <xsl:apply-templates xmlns="http://transpect.io/xml2tex" mode="#current"/>
      <xsl:value-of xmlns="http://transpect.io/xml2tex" select="'&#xA;\end{enumerate}&#xA;'"/>
   </xsl:template>
   <xsl:variable name="texregex"
                 select="'([&lt;&gt;\^\|~ ¡¢£¥§©«¬­®°±²³µ¶¹º»¿ÅÆ×Øßåæð÷øħıŁłŒœǀƒȷɐɑɒɓɔɕɖɗɘəɚɛɜɝɞɟɠɡɢɣɤɥɦɧɨɩɪɫɬɭɮɯɰɱɲɳɴɵɶɷɸɹɺɻɼɽɾʀʁʂʃʄʆʇʈʉʊʋʌʍʎʏʐʑʒʓʔʕʖʗʘʙʚʛʜʝʞʟʠʡʢʣʤʥʦʧʨ˜˜∼˜˜∼ΑΒΓΓΓΓΔΔΔΔΕΖΗΘΘΘΘΙΚΛΛΛΛΜΝΞΞΞΞΟΠΠΠΠΡΣΣΣΣΤΥΥΥΥΦΦΦΦΧΨΨΨΨΩΩΩΩααααββββγγγγδδδδεεεεζΦζζηΧηηθθθθιιιικκκκλλλλμμμμννννξξξξοππππρρρρςςςςσσσσττττυυυυφφφφχχχχψψψψωωωωϐϑϑϑϑϕϕϕϕϖϖϖϖϘϘϙϙϚϚϛϛϜϜϝϝϞϞϟϟϠϠϡϡϱϱϴϴϴϴϵϵ϶϶          ​‑‒–—―‖‚‛“”„†‡•‣․‥…‧ ‰‱′″‴‵‶‷‸‹›‼⁀⁃⁇⁗⁡⁢⁣⁤ ⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₔₕₖₗₘₙₚₛₜ₡₤₦₧₨₩₫€₱₲⃐⃑⃖⃗⃛⃜⃝⃝⃞⃡⃤⃮⃯ℂℇℊℋℌℍℎℏℐℑℒℓℕ℘ℙℚℛℜℝ℠™ℤΩ℧ℨÅℬℭℯℰℱℲℳℴℵℶℷℸℼℽℾℿ⅀⅁⅂⅃⅄ⅅⅆⅇⅈⅉ⅊⅋←↑→↓↔↕↖↗↘↙↚↛↞↠↢↣↤↥↦↧↨↩↪↫↬↭↮↯↰↱↲↳↶↷↺↻↼↽↾↿⇀⇁⇂⇃⇄⇅⇆⇇⇈⇉⇊⇋⇌⇍⇎⇏⇐⇑⇒⇓⇔⇕⇖⇗⇘⇙⇚⇛⇜⇝⇠⇢⇤⇥⇵⇸⇻⇽⇾⇿∀∁∂∃∄∅∆∆∆∆∇∈∉∊∋∌∍∎∏∐∑−∓∔∕∖∗∘∙√∛∜∝∞∟∠∡∢∣∤∥∦∧∨∩∪∫∬∭∮∯∰∲∳∴∵∶∷∸∹∼∽∿≀≁≂≃≄≅≇≈≉≊≍≎≏≐≑≒≓≔≕≖≗≙≜≠≡≢≤≥≦≧≨≩≪≫≬≭≮≯≰≱≲≳≴≵≶≷≹≺≻≼≽≾≿⊀⊁⊂⊃⊄⊅⊆⊇⊈⊉⊊⊋⊎⊏⊐⊑⊒⊓⊔⊕⊖⊗⊘⊙⊚⊛⊝⊞⊟⊠⊡⊢⊣⊤⊥⊧⊨⊩⊪⊫⊬⊭⊮⊯⊲⊳⊴⊵⊶⊷⊸⊺⊻⊼⋀⋁⋂⋃⋄⋅⋆⋇⋈⋉⋊⋋⋌⋍⋎⋏⋐⋑⋒⋓⋔⋕⋖⋗⋘⋙⋚⋛⋞⋟⋠⋡⋢⋣⋦⋧⋨⋩⋪⋫⋬⋭⋮⋯⋰⋱⋶⌀⌂⌈⌉⌐⌑⌒⌓⌗⌙⌠⌡⌊⌋⌜⌝⌞⌟⌢⌣〈〉⌬⌲⌶⌹⍀⌿⍀⍇⍈⍐⍓⍗⍝⍞⍟⍰⍺⍼⎔⏜⏝⏞⏟␣①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⑾⑿⒀⒁⒂⒃⒄⒅⒆⒇⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑⒒⒓⒔⒕⒖⒗⒘⒙⒚⒛⒜⒝⒞⒟⒠⒡⒢⒣⒤⒥⒦⒧⒨⒩⒪⒫⒬⒭⒮⒯⒰⒱⒲⒳⒴⒵ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ⓪⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾⓿│■□▪△▴▵▶▷▸▹▽▾▿◀◁◂◃◆◇◊○●◐◑◖◗◫◻◼★☉☎☏☐☑☒☕☞☠☢☣☯☹☺☻☼☽☾☿♀♁♂♃♄♅♆♇♈♉♊♋♌♍♎♏♐♑♒♓♠♡♢♣♤♥♦♧♩♪♫♬♭♮♯♻⚓⚔⚠⚪⚫✀✁✂✃✄✅✆✇✈✉✊✋✌✍✎✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝✞✟✠✡✢✣✤✥✦✧✨✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋❌❍❎❏❐❑❒❓❔❕❖❗❘❙❚❛❜❝❞❟❠❡❢❣❤❥❦❧❨❩❪❫❬❭❰❱❲❳❴❵❶❷❸❹❺❻❼❽❾❿➀➁➂➃➄➅➆➇➈➉➊➋➌➍➎➏➐➑➒➓➔➕➖➗➘➙➚➛➜➝➞➟➠➡➢➣➤➥➦➧➨➩➪➫➬➭➮➯➱➲➳➴➵➶➷➸➹➺➻➼➽➾⟂⟅⟆⟐⟜⟦⟧⟨⟩⟪⟫⟮⟯⟵⟶⟷⟸⟹⟺⟻⟼⟽⟾⤀⤆⤇⤒⤓⤔⤕⤖⤳⥊⥋⥎⥏⥐⥑⥒⥓⥔⥕⥖⥗⥘⥙⥚⥛⥜⥝⥞⥟⥠⥡⥢⥣⥤⥥⥪⥫⥬⥭⥮⥯⥼⥽⦀⦁⦅⦆⦇⦈⦉⦊⦸⧀⧁⧄⧅⧆⧇⧈⧏⧐⧟⧫⧵⧹⨀⨁⨂⨄⨅⨆⨉⨌⨏⨖⨝⨟⨠⨡⨾⨿⩞⩤⩥⩴⩵⩶⩽⩾⪅⪆⪇⪈⪉⪊⪋⪌⪕⪖⪡⪢⪦⪧⪯⪰⪳⪴⪷⪸⪹⪺⪻⪼⫅⫆⫋⫌⫪⫫⫴⫼⫽⫾⬛⬜⬝⬧⬨！＂＃＄％＆＇（）＊＋，－．／�𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍𝑎𝑏𝑐𝑑𝑒𝑓𝑔𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒉𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛𝒜𝒞𝒟𝒢𝒥𝒦𝒩𝒪𝒫𝒬𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵𝒶𝒷𝒸𝒹𝒻𝒽𝒾𝒿𝓀𝓁𝓂𝓃𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏𝔄𝔅𝔇𝔈𝔉𝔊𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔𝔖𝔗𝔘𝔙𝔚𝔛𝔜𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷𝔸𝔹𝔻𝔼𝔽𝔾𝕀𝕁𝕂𝕃𝕄𝕆𝕊𝕋𝕌𝕍𝕎𝕏𝕐𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫𝖠𝖡𝖢𝖣𝖤𝖥𝖦𝖧𝖨𝖩𝖪𝖫𝖬𝖭𝖮𝖯𝖰𝖱𝖲𝖳𝖴𝖵𝖶𝖷𝖸𝖹𝖺𝖻𝖼𝖽𝖾𝖿𝗀𝗁𝗂𝗃𝗄𝗅𝗆𝗇𝗈𝗉𝗊𝗋𝗌𝗍𝗎𝗏𝗐𝗑𝗒𝗓𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣𝚤𝚥𝚪𝚫𝚯𝚲𝚵𝚷𝚺𝚼𝚽𝚿𝛀𝛂𝛃𝛄𝛅𝛆𝛇𝛈𝛉𝛊𝛋𝛌𝛍𝛎𝛏𝛑𝛒𝛓𝛔𝛕𝛖𝛗𝛘𝛙𝛚𝛜𝛝𝛟𝛠𝛡𝛤𝛥𝛩𝛬𝛯𝛱𝛴𝛶𝛷𝛹𝛺𝛼𝛽𝛾𝛿𝜀𝜁𝜂𝜃𝜄𝜅𝜆𝜇𝜈𝜉𝜋𝜌𝜍𝜎𝜏𝜐𝜑𝜒𝜓𝜔𝜕𝜖𝜗𝜘𝜙𝜚𝜛𝜞𝜟𝜣𝜦𝜩𝜫𝜮𝜰𝜱𝜳𝜴𝜶𝜷𝜸𝜹𝜺𝜻𝜼𝜽𝜾𝜿𝝀𝝁𝝂𝝃𝝅𝝆𝝇𝝈𝝉𝝊𝝋𝝌𝝍𝝎𝝐𝝑𝝓𝝔𝝕𝝘𝝙𝝝𝝠𝝣𝝥𝝨𝝪𝝫𝝭𝝮𝝰𝝱𝝲𝝳𝝴𝝵𝝶𝝷𝝸𝝹𝝺𝝻𝝼𝝽𝝿𝞀𝞁𝞂𝞃𝞄𝞅𝞆𝞇𝞈𝞊𝞋𝞍𝞎𝞏𝞒𝞓𝞗𝞚𝞝𝞟𝞢𝞤𝞥𝞧𝞨𝞪𝞫𝞬𝞭𝞮𝞯𝞰𝞱𝞲𝞳𝞴𝞵𝞶𝞷𝞹𝞺𝞻𝞼𝞽𝞾𝞿𝟀𝟁𝟂𝟄𝟅𝟇𝟈𝟉𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡𝟢𝟣𝟤𝟥𝟦𝟧𝟨𝟩𝟪𝟫𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿🔔🡨🡩🡪🡫])'"
                 as="xs:string"/>
   <xsl:variable name="charmap" as="element(xml2tex:char)*">
      <xml2tex:char>
         <xml2tex:character>&lt;</xml2tex:character>
         <xml2tex:string>{\textless}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>&gt;</xml2tex:character>
         <xml2tex:string>{\textgreater}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>^</xml2tex:character>
         <xml2tex:string>\textasciicircum{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>|</xml2tex:character>
         <xml2tex:string>{\textbar}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>~</xml2tex:character>
         <xml2tex:string>\textasciitilde{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>~</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>¡</xml2tex:character>
         <xml2tex:string>{\textexclamdown}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>¢</xml2tex:character>
         <xml2tex:string>{\cent}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>£</xml2tex:character>
         <xml2tex:string>{\pounds}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>¥</xml2tex:character>
         <xml2tex:string>{\yen}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>§</xml2tex:character>
         <xml2tex:string>{\S}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>©</xml2tex:character>
         <xml2tex:string>{\textcopyright}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>«</xml2tex:character>
         <xml2tex:string>"&lt;</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>¬</xml2tex:character>
         <xml2tex:string>${\neg}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>­</xml2tex:character>
         <xml2tex:string>\-</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>®</xml2tex:character>
         <xml2tex:string>{\textregistered}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>°</xml2tex:character>
         <xml2tex:string>$^{\circ}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>±</xml2tex:character>
         <xml2tex:string>${\pm}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>²</xml2tex:character>
         <xml2tex:string>$^{2}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>³</xml2tex:character>
         <xml2tex:string>$^{3}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>µ</xml2tex:character>
         <xml2tex:string>${\mathrm{\mu}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>¶</xml2tex:character>
         <xml2tex:string>\P</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>¹</xml2tex:character>
         <xml2tex:string>$^{1}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>º</xml2tex:character>
         <xml2tex:string>$^{\circ}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>»</xml2tex:character>
         <xml2tex:string>"&gt;</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>¿</xml2tex:character>
         <xml2tex:string>{\textquestiondown}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Å</xml2tex:character>
         <xml2tex:string>\AA{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Æ</xml2tex:character>
         <xml2tex:string>\AE{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>×</xml2tex:character>
         <xml2tex:string>${\times}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ø</xml2tex:character>
         <xml2tex:string>\O{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ß</xml2tex:character>
         <xml2tex:string>"z</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>å</xml2tex:character>
         <xml2tex:string>\aa{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>æ</xml2tex:character>
         <xml2tex:string>\ae{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ð</xml2tex:character>
         <xml2tex:string>${\eth}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>÷</xml2tex:character>
         <xml2tex:string>${\div}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ø</xml2tex:character>
         <xml2tex:string>\o{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ħ</xml2tex:character>
         <xml2tex:string>\textcrh{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ı</xml2tex:character>
         <xml2tex:string>\i{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ł</xml2tex:character>
         <xml2tex:string>\L{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ł</xml2tex:character>
         <xml2tex:string>\l{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Œ</xml2tex:character>
         <xml2tex:string>\OE{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>œ</xml2tex:character>
         <xml2tex:string>\oe{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ǀ</xml2tex:character>
         <xml2tex:string>{\textbar}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ƒ</xml2tex:character>
         <xml2tex:string>${\mathit{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ȷ</xml2tex:character>
         <xml2tex:string>${\jmath}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɐ</xml2tex:character>
         <xml2tex:string>\textturna{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɑ</xml2tex:character>
         <xml2tex:string>\textscripta{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɒ</xml2tex:character>
         <xml2tex:string>\textturnscripta{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɓ</xml2tex:character>
         <xml2tex:string>\texthtb{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɔ</xml2tex:character>
         <xml2tex:string>\textopeno{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɕ</xml2tex:character>
         <xml2tex:string>\textctc{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɖ</xml2tex:character>
         <xml2tex:string>\textrtaild{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɗ</xml2tex:character>
         <xml2tex:string>\texthtd{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɘ</xml2tex:character>
         <xml2tex:string>\textreve{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ə</xml2tex:character>
         <xml2tex:string>\textschwa{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɚ</xml2tex:character>
         <xml2tex:string>\textrhookschwa{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɛ</xml2tex:character>
         <xml2tex:string>\textepsilon{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɜ</xml2tex:character>
         <xml2tex:string>\textrevepsilon{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɝ</xml2tex:character>
         <xml2tex:string>\textrhookrevepsilon{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɞ</xml2tex:character>
         <xml2tex:string>\textcloserevepsilon{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɟ</xml2tex:character>
         <xml2tex:string>\textbardotlessj{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɠ</xml2tex:character>
         <xml2tex:string>\texthtg{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɡ</xml2tex:character>
         <xml2tex:string>\textg{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɢ</xml2tex:character>
         <xml2tex:string>\textscg{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɣ</xml2tex:character>
         <xml2tex:string>\textbabygamma{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɤ</xml2tex:character>
         <xml2tex:string>textramshorns{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɥ</xml2tex:character>
         <xml2tex:string>\textturnh{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɦ</xml2tex:character>
         <xml2tex:string>\texthth{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɧ</xml2tex:character>
         <xml2tex:string>\texththeng{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɨ</xml2tex:character>
         <xml2tex:string>\textbari{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɩ</xml2tex:character>
         <xml2tex:string>\textiota{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɪ</xml2tex:character>
         <xml2tex:string>\textsci{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɫ</xml2tex:character>
         <xml2tex:string>\textltilde{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɬ</xml2tex:character>
         <xml2tex:string>\textbeltl{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɭ</xml2tex:character>
         <xml2tex:string>\textrtaill{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɮ</xml2tex:character>
         <xml2tex:string>\textlyoghlig{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɯ</xml2tex:character>
         <xml2tex:string>\textturnm{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɰ</xml2tex:character>
         <xml2tex:string>\textturnmrleg{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɱ</xml2tex:character>
         <xml2tex:string>\textltailm{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɲ</xml2tex:character>
         <xml2tex:string>\textltailn{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɳ</xml2tex:character>
         <xml2tex:string>\textnrleg{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɴ</xml2tex:character>
         <xml2tex:string>\textscn{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɵ</xml2tex:character>
         <xml2tex:string>\textbaro{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɶ</xml2tex:character>
         <xml2tex:string>\textscoelig{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɷ</xml2tex:character>
         <xml2tex:string>\textcloseomega{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɸ</xml2tex:character>
         <xml2tex:string>\textphi{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɹ</xml2tex:character>
         <xml2tex:string>\textturnr{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɺ</xml2tex:character>
         <xml2tex:string>\textturnlonglegr{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɻ</xml2tex:character>
         <xml2tex:string>\textturnrrtail{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɼ</xml2tex:character>
         <xml2tex:string>\textlonglegr{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɽ</xml2tex:character>
         <xml2tex:string>\textrtailr{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ɾ</xml2tex:character>
         <xml2tex:string>\textfishhookr{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʀ</xml2tex:character>
         <xml2tex:string>\textscr{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʁ</xml2tex:character>
         <xml2tex:string>\textinvscr{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʂ</xml2tex:character>
         <xml2tex:string>\textrtails{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʃ</xml2tex:character>
         <xml2tex:string>\textesh{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʄ</xml2tex:character>
         <xml2tex:string>\texthtbardotlessj{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʆ</xml2tex:character>
         <xml2tex:string>\textctesh{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʇ</xml2tex:character>
         <xml2tex:string>\textturnt{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʈ</xml2tex:character>
         <xml2tex:string>\textrtailt{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʉ</xml2tex:character>
         <xml2tex:string>\textbaru{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʊ</xml2tex:character>
         <xml2tex:string>\textupsilon{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʋ</xml2tex:character>
         <xml2tex:string>\textscriptv{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʌ</xml2tex:character>
         <xml2tex:string>\textturnv{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʍ</xml2tex:character>
         <xml2tex:string>\textturnw{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʎ</xml2tex:character>
         <xml2tex:string>\textturny{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʏ</xml2tex:character>
         <xml2tex:string>\textscy{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʐ</xml2tex:character>
         <xml2tex:string>\textrtailz{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʑ</xml2tex:character>
         <xml2tex:string>\textctz{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʒ</xml2tex:character>
         <xml2tex:string>\textyogh{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʓ</xml2tex:character>
         <xml2tex:string>\textctyogh{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʔ</xml2tex:character>
         <xml2tex:string>\textglotstop{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʕ</xml2tex:character>
         <xml2tex:string>\textrevglotstop{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʖ</xml2tex:character>
         <xml2tex:string>\textinvglotstop{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʗ</xml2tex:character>
         <xml2tex:string>\textstretchc{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʘ</xml2tex:character>
         <xml2tex:string>\textbullseye{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʙ</xml2tex:character>
         <xml2tex:string>\textscb{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʚ</xml2tex:character>
         <xml2tex:string>\textcloseepsilon{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʛ</xml2tex:character>
         <xml2tex:string>\texthtscg{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʜ</xml2tex:character>
         <xml2tex:string>\textsch{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʝ</xml2tex:character>
         <xml2tex:string>\textctj{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʞ</xml2tex:character>
         <xml2tex:string>\textturnk{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʟ</xml2tex:character>
         <xml2tex:string>\textscl{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʠ</xml2tex:character>
         <xml2tex:string>\texthtq{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʡ</xml2tex:character>
         <xml2tex:string>\textbarglotstop{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʢ</xml2tex:character>
         <xml2tex:string>\textbarrevglotstop{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʣ</xml2tex:character>
         <xml2tex:string>\textdzlig{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʤ</xml2tex:character>
         <xml2tex:string>\textdyoghlig{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʥ</xml2tex:character>
         <xml2tex:string>\textdctzlig{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʦ</xml2tex:character>
         <xml2tex:string>\texttslig{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʧ</xml2tex:character>
         <xml2tex:string>\textteshlig{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ʨ</xml2tex:character>
         <xml2tex:string>\texttctclig{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>˜˜∼</xml2tex:character>
         <xml2tex:string>${\sim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>˜˜∼</xml2tex:character>
         <xml2tex:string>\textasciitilde</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Α</xml2tex:character>
         <xml2tex:string>A</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Β</xml2tex:character>
         <xml2tex:string>B</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Γ</xml2tex:character>
         <xml2tex:string>${\Upgamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Γ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Upgamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Γ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Gamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Γ</xml2tex:character>
         <xml2tex:string>${\Gamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Δ</xml2tex:character>
         <xml2tex:string>${\Updelta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Δ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Updelta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Δ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Delta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Δ</xml2tex:character>
         <xml2tex:string>${\Delta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ε</xml2tex:character>
         <xml2tex:string>E</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ζ</xml2tex:character>
         <xml2tex:string>Z</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Η</xml2tex:character>
         <xml2tex:string>H</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Θ</xml2tex:character>
         <xml2tex:string>${\Uptheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Θ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Uptheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Θ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Theta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Θ</xml2tex:character>
         <xml2tex:string>${\Theta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ι</xml2tex:character>
         <xml2tex:string>I</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Κ</xml2tex:character>
         <xml2tex:string>K</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Λ</xml2tex:character>
         <xml2tex:string>${\Uplambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Λ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Uplambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Λ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Lambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Λ</xml2tex:character>
         <xml2tex:string>${\Lambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Μ</xml2tex:character>
         <xml2tex:string>M</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ν</xml2tex:character>
         <xml2tex:string>N</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ξ</xml2tex:character>
         <xml2tex:string>${\Upxi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Ξ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Upxi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Ξ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Xi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Ξ</xml2tex:character>
         <xml2tex:string>${\Xi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ο</xml2tex:character>
         <xml2tex:string>O</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Π</xml2tex:character>
         <xml2tex:string>${\Uppi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Π</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Uppi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Π</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Pi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Π</xml2tex:character>
         <xml2tex:string>${\Pi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ρ</xml2tex:character>
         <xml2tex:string>P</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Σ</xml2tex:character>
         <xml2tex:string>${\Upsigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Σ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Upsigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Σ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Sigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Σ</xml2tex:character>
         <xml2tex:string>${\Sigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Τ</xml2tex:character>
         <xml2tex:string>T</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Υ</xml2tex:character>
         <xml2tex:string>${\Upupsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Υ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Upupsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Υ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Upsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Υ</xml2tex:character>
         <xml2tex:string>${\Upsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Φ</xml2tex:character>
         <xml2tex:string>${\Upphi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Φ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Upphi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Φ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Phi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Φ</xml2tex:character>
         <xml2tex:string>${\Phi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Χ</xml2tex:character>
         <xml2tex:string>X</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ψ</xml2tex:character>
         <xml2tex:string>${\Uppsi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Ψ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Uppsi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Ψ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Psi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Ψ</xml2tex:character>
         <xml2tex:string>${\Psi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ω</xml2tex:character>
         <xml2tex:string>${\Upomega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Ω</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Upomega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Ω</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Omega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>Ω</xml2tex:character>
         <xml2tex:string>${\Omega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>α</xml2tex:character>
         <xml2tex:string>${\upalpha}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>α</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upalpha}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>α</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\alpha}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>α</xml2tex:character>
         <xml2tex:string>${\alpha}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>β</xml2tex:character>
         <xml2tex:string>${\upbeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>β</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upbeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>β</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\beta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>β</xml2tex:character>
         <xml2tex:string>${\beta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>γ</xml2tex:character>
         <xml2tex:string>${\upgamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>γ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upgamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>γ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\gamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>γ</xml2tex:character>
         <xml2tex:string>${\gamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>δ</xml2tex:character>
         <xml2tex:string>${\updelta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>δ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\updelta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>δ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\delta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>δ</xml2tex:character>
         <xml2tex:string>${\delta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ε</xml2tex:character>
         <xml2tex:string>${\upvarepsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ε</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upvarepsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ε</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\varepsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ε</xml2tex:character>
         <xml2tex:string>${\varepsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ζ</xml2tex:character>
         <xml2tex:string>${\upzeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Φ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upzeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ζ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\zeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ζ</xml2tex:character>
         <xml2tex:string>${\zeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>η</xml2tex:character>
         <xml2tex:string>${\upeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>Χ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>η</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\eta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>η</xml2tex:character>
         <xml2tex:string>${\eta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>θ</xml2tex:character>
         <xml2tex:string>${\uptheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>θ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\uptheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>θ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\theta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>θ</xml2tex:character>
         <xml2tex:string>${\theta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ι</xml2tex:character>
         <xml2tex:string>${\upiota}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ι</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upiota}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ι</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\iota}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ι</xml2tex:character>
         <xml2tex:string>${\iota}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>κ</xml2tex:character>
         <xml2tex:string>${\upkappa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>κ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upkappa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>κ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\kappa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>κ</xml2tex:character>
         <xml2tex:string>${\kappa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>λ</xml2tex:character>
         <xml2tex:string>${\uplambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>λ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\uplambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>λ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\lambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>λ</xml2tex:character>
         <xml2tex:string>${\lambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>μ</xml2tex:character>
         <xml2tex:string>${\upmu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>μ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upmu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>μ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\mu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>μ</xml2tex:character>
         <xml2tex:string>${\mu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ν</xml2tex:character>
         <xml2tex:string>${\upnu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ν</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upnu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ν</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\nu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ν</xml2tex:character>
         <xml2tex:string>${\nu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ξ</xml2tex:character>
         <xml2tex:string>${\upxi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ξ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upxi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ξ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\xi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ξ</xml2tex:character>
         <xml2tex:string>${\xi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ο</xml2tex:character>
         <xml2tex:string>o</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>π</xml2tex:character>
         <xml2tex:string>${\uppi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>π</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\uppi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>π</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\pi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>π</xml2tex:character>
         <xml2tex:string>${\pi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ρ</xml2tex:character>
         <xml2tex:string>${\uprho}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ρ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\uprho}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ρ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\rho}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ρ</xml2tex:character>
         <xml2tex:string>${\rho}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ς</xml2tex:character>
         <xml2tex:string>${\mathrm{\varsigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ς</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\mathrm{\varsigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ς</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\varsigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ς</xml2tex:character>
         <xml2tex:string>${\varsigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>σ</xml2tex:character>
         <xml2tex:string>${\upsigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>σ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upsigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>σ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\sigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>σ</xml2tex:character>
         <xml2tex:string>${\sigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>τ</xml2tex:character>
         <xml2tex:string>${\uptau}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>τ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\uptau}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>τ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\tau}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>τ</xml2tex:character>
         <xml2tex:string>${\tau}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>υ</xml2tex:character>
         <xml2tex:string>${\upupsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>υ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upupsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>υ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>υ</xml2tex:character>
         <xml2tex:string>${\upsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>φ</xml2tex:character>
         <xml2tex:string>${\upvarphi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>φ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upvarphi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>φ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\varphi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>φ</xml2tex:character>
         <xml2tex:string>${\varphi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>χ</xml2tex:character>
         <xml2tex:string>${\upchi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>χ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upchi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>χ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\chi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>χ</xml2tex:character>
         <xml2tex:string>${\chi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ψ</xml2tex:character>
         <xml2tex:string>${\uppsi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ψ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\uppsi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ψ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\psi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ψ</xml2tex:character>
         <xml2tex:string>${\psi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ω</xml2tex:character>
         <xml2tex:string>${\upomega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ω</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upomega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ω</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\omega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ω</xml2tex:character>
         <xml2tex:string>${\omega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϐ</xml2tex:character>
         <xml2tex:string>${\varbeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϑ</xml2tex:character>
         <xml2tex:string>${\upvartheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ϑ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upvartheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϑ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\vartheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ϑ</xml2tex:character>
         <xml2tex:string>${\vartheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϕ</xml2tex:character>
         <xml2tex:string>${\upphi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ϕ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upphi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϕ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\phi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ϕ</xml2tex:character>
         <xml2tex:string>${\phi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϖ</xml2tex:character>
         <xml2tex:string>${\upvarpi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ϖ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\upvarpi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϖ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\varpi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ϖ</xml2tex:character>
         <xml2tex:string>${\varpi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ϙ</xml2tex:character>
         <xml2tex:string>${\Koppa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Ϙ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Koppa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϙ</xml2tex:character>
         <xml2tex:string>${\koppa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϙ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\koppa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ϛ</xml2tex:character>
         <xml2tex:string>${\Stigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Ϛ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Stigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϛ</xml2tex:character>
         <xml2tex:string>${\stigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϛ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\stigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ϝ</xml2tex:character>
         <xml2tex:string>${\Digamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Ϝ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Digamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϝ</xml2tex:character>
         <xml2tex:string>${\digamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϝ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\digamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ϟ</xml2tex:character>
         <xml2tex:string>${\Koppa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Ϟ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Koppa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϟ</xml2tex:character>
         <xml2tex:string>${\koppa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϟ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\koppa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ϡ</xml2tex:character>
         <xml2tex:string>${\Sampi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>Ϡ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Sampi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϡ</xml2tex:character>
         <xml2tex:string>${\sampi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϡ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\sampi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϱ</xml2tex:character>
         <xml2tex:string>${\varrho}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϱ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\varrho}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϴ</xml2tex:character>
         <xml2tex:string>${\Uptheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>ϴ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Uptheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϴ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Theta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>ϴ</xml2tex:character>
         <xml2tex:string>${\Theta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ϵ</xml2tex:character>
         <xml2tex:string>${\epsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>ϵ</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\epsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>϶</xml2tex:character>
         <xml2tex:string>${\backepsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>϶</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\backepsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>{\quad}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>{\enspace}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>{\quad}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>\,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>\,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>\,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>\,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>\,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>\,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>\,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>​</xml2tex:character>
         <xml2tex:string>\hspace{0pt}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‑</xml2tex:character>
         <xml2tex:string>\hbox{-}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‒</xml2tex:character>
         <xml2tex:string>$-$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>–</xml2tex:character>
         <xml2tex:string>\textendash{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>—</xml2tex:character>
         <xml2tex:string>\textemdash{}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>―</xml2tex:character>
         <xml2tex:string>{---}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‖</xml2tex:character>
         <xml2tex:string>${\|}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‚</xml2tex:character>
         <xml2tex:string>,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‛</xml2tex:character>
         <xml2tex:string>`</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>“</xml2tex:character>
         <xml2tex:string>``</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>”</xml2tex:character>
         <xml2tex:string>''</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>„</xml2tex:character>
         <xml2tex:string>"`</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>†</xml2tex:character>
         <xml2tex:string>${\dag}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‡</xml2tex:character>
         <xml2tex:string>${\ddag}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>•</xml2tex:character>
         <xml2tex:string>{\textbullet}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‣</xml2tex:character>
         <xml2tex:string>${\blacktriangleright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>․</xml2tex:character>
         <xml2tex:string>${\ldotp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‥</xml2tex:character>
         <xml2tex:string>${\ldotp\ldotp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>…</xml2tex:character>
         <xml2tex:string>{\ldots}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‧</xml2tex:character>
         <xml2tex:string>{\textbullet}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>\,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‰</xml2tex:character>
         <xml2tex:string>{\textperthousand}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‱</xml2tex:character>
         <xml2tex:string>{\textpertenthousand}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>′</xml2tex:character>
         <xml2tex:string>$^{\prime}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>″</xml2tex:character>
         <xml2tex:string>$^{\prime\prime}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‴</xml2tex:character>
         <xml2tex:string>$^{\prime\prime\prime}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‵</xml2tex:character>
         <xml2tex:string>${\backprime}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‶</xml2tex:character>
         <xml2tex:string>${\backdprime}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‷</xml2tex:character>
         <xml2tex:string>${\backtrprime}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‸</xml2tex:character>
         <xml2tex:string>${\caretinsert}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‹</xml2tex:character>
         <xml2tex:string>{\flq}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>›</xml2tex:character>
         <xml2tex:string>{\frq}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>‼</xml2tex:character>
         <xml2tex:string>${\Exclam}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁀</xml2tex:character>
         <xml2tex:string>${\cat}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁃</xml2tex:character>
         <xml2tex:string>${\hyphenbullet}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁇</xml2tex:character>
         <xml2tex:string>${\Question}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁗</xml2tex:character>
         <xml2tex:string>${\qprime}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁡</xml2tex:character>
         <xml2tex:string> </xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁢</xml2tex:character>
         <xml2tex:string> </xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁣</xml2tex:character>
         <xml2tex:string> </xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁤</xml2tex:character>
         <xml2tex:string> </xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character> </xml2tex:character>
         <xml2tex:string>${\:}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁴</xml2tex:character>
         <xml2tex:string>$^{4}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁵</xml2tex:character>
         <xml2tex:string>$^{5}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁶</xml2tex:character>
         <xml2tex:string>$^{6}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁷</xml2tex:character>
         <xml2tex:string>$^{7}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁸</xml2tex:character>
         <xml2tex:string>$^{8}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁹</xml2tex:character>
         <xml2tex:string>$^{9}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁺</xml2tex:character>
         <xml2tex:string>$^{+}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁻</xml2tex:character>
         <xml2tex:string>$^{-}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁼</xml2tex:character>
         <xml2tex:string>$^{=}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁽</xml2tex:character>
         <xml2tex:string>$^{(}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⁾</xml2tex:character>
         <xml2tex:string>$^{)}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⁿ</xml2tex:character>
         <xml2tex:string>$^{n}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₀</xml2tex:character>
         <xml2tex:string>$_{0}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₁</xml2tex:character>
         <xml2tex:string>$_{1}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₂</xml2tex:character>
         <xml2tex:string>$_{2}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₃</xml2tex:character>
         <xml2tex:string>$_{3}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₄</xml2tex:character>
         <xml2tex:string>$_{4}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₅</xml2tex:character>
         <xml2tex:string>$_{5}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₆</xml2tex:character>
         <xml2tex:string>$_{6}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₇</xml2tex:character>
         <xml2tex:string>$_{7}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₈</xml2tex:character>
         <xml2tex:string>$_{8}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₉</xml2tex:character>
         <xml2tex:string>$_{9}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₊</xml2tex:character>
         <xml2tex:string>$_{+}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₋</xml2tex:character>
         <xml2tex:string>$_{-}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₌</xml2tex:character>
         <xml2tex:string>$_{=}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₍</xml2tex:character>
         <xml2tex:string>$_{(}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₎</xml2tex:character>
         <xml2tex:string>$_{)}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₐ</xml2tex:character>
         <xml2tex:string>$_{a}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₑ</xml2tex:character>
         <xml2tex:string>$_{e}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₒ</xml2tex:character>
         <xml2tex:string>$_{o}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₓ</xml2tex:character>
         <xml2tex:string>$_{x}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₔ</xml2tex:character>
         <xml2tex:string>$_{\text{\textschwa}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₕ</xml2tex:character>
         <xml2tex:string>$_{h}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₖ</xml2tex:character>
         <xml2tex:string>$_{k}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₗ</xml2tex:character>
         <xml2tex:string>$_{l}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₘ</xml2tex:character>
         <xml2tex:string>$_{m}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₙ</xml2tex:character>
         <xml2tex:string>$_{n}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₚ</xml2tex:character>
         <xml2tex:string>$_{p}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₛ</xml2tex:character>
         <xml2tex:string>$_{s}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ₜ</xml2tex:character>
         <xml2tex:string>$_{t}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₡</xml2tex:character>
         <xml2tex:string>{\textcolonmonetary}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₤</xml2tex:character>
         <xml2tex:string>{\textlira}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₦</xml2tex:character>
         <xml2tex:string>{\textnaira}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₧</xml2tex:character>
         <xml2tex:string>Pt</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₨</xml2tex:character>
         <xml2tex:string>Rs</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₩</xml2tex:character>
         <xml2tex:string>{\textwon}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₫</xml2tex:character>
         <xml2tex:string>{\textdong}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>€</xml2tex:character>
         <xml2tex:string>{\texteuro}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₱</xml2tex:character>
         <xml2tex:string>{\textpeso}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>₲</xml2tex:character>
         <xml2tex:string>{\textguarani}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃐</xml2tex:character>
         <xml2tex:string>${\lvec}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃑</xml2tex:character>
         <xml2tex:string>${\vec}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃖</xml2tex:character>
         <xml2tex:string>${\LVec}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃗</xml2tex:character>
         <xml2tex:string>${\vec}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃛</xml2tex:character>
         <xml2tex:string>${\dddot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃜</xml2tex:character>
         <xml2tex:string>${\ddddot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃝</xml2tex:character>
         <xml2tex:string>${\enclosecircle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃝</xml2tex:character>
         <xml2tex:string>${\enclosesquare}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃞</xml2tex:character>
         <xml2tex:string>${\enclosediamond}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃡</xml2tex:character>
         <xml2tex:string>${\overleftrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃤</xml2tex:character>
         <xml2tex:string>${\enclosetriangle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃮</xml2tex:character>
         <xml2tex:string>${\underleftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⃯</xml2tex:character>
         <xml2tex:string>${\underrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℂ</xml2tex:character>
         <xml2tex:string>${\mathbb{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℇ</xml2tex:character>
         <xml2tex:string>${\Euler}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℊ</xml2tex:character>
         <xml2tex:string>${\mathcal{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℋ</xml2tex:character>
         <xml2tex:string>${\mathcal{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℌ</xml2tex:character>
         <xml2tex:string>${\mathfrak{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℍ</xml2tex:character>
         <xml2tex:string>${\mathbb{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℎ</xml2tex:character>
         <xml2tex:string>${\mathit{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℏ</xml2tex:character>
         <xml2tex:string>${\hslash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℐ</xml2tex:character>
         <xml2tex:string>${\mathcal{I}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℑ</xml2tex:character>
         <xml2tex:string>${\Im}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℒ</xml2tex:character>
         <xml2tex:string>${\mathcal{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℓ</xml2tex:character>
         <xml2tex:string>${\ell}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℕ</xml2tex:character>
         <xml2tex:string>${\mathbb{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>℘</xml2tex:character>
         <xml2tex:string>${\wp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℙ</xml2tex:character>
         <xml2tex:string>${\mathbb{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℚ</xml2tex:character>
         <xml2tex:string>${\mathbb{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℛ</xml2tex:character>
         <xml2tex:string>${\mathcal{R}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℜ</xml2tex:character>
         <xml2tex:string>${\Re}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℝ</xml2tex:character>
         <xml2tex:string>${\mathbb{R}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>℠</xml2tex:character>
         <xml2tex:string>{\textservicemark}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>™</xml2tex:character>
         <xml2tex:string>{\texttrademark}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℤ</xml2tex:character>
         <xml2tex:string>${\mathbb{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ω</xml2tex:character>
         <xml2tex:string>${\tcohm}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>℧</xml2tex:character>
         <xml2tex:string>${\mho}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℨ</xml2tex:character>
         <xml2tex:string>${\mathfrak{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Å</xml2tex:character>
         <xml2tex:string>${\Angstroem}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℬ</xml2tex:character>
         <xml2tex:string>${\mathcal{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℭ</xml2tex:character>
         <xml2tex:string>${\mathfrak{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℯ</xml2tex:character>
         <xml2tex:string>${\mathcal{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℰ</xml2tex:character>
         <xml2tex:string>${\mathcal{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℱ</xml2tex:character>
         <xml2tex:string>${\mathcal{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⅎ</xml2tex:character>
         <xml2tex:string>${\Finv}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℳ</xml2tex:character>
         <xml2tex:string>${\mathcal{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℴ</xml2tex:character>
         <xml2tex:string>${\mathcal{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℵ</xml2tex:character>
         <xml2tex:string>${\aleph}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℶ</xml2tex:character>
         <xml2tex:string>${\beth}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℷ</xml2tex:character>
         <xml2tex:string>${\gimel}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℸ</xml2tex:character>
         <xml2tex:string>${\daleth}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℼ</xml2tex:character>
         <xml2tex:string>${\mathbb{pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℽ</xml2tex:character>
         <xml2tex:string>${\mathbb{gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℾ</xml2tex:character>
         <xml2tex:string>${\mathbb{Gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ℿ</xml2tex:character>
         <xml2tex:string>${\mathbb{Pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⅀</xml2tex:character>
         <xml2tex:string>${\mathbb{Sigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⅁</xml2tex:character>
         <xml2tex:string>${\Game}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⅂</xml2tex:character>
         <xml2tex:string>${\sansLturned}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⅃</xml2tex:character>
         <xml2tex:string>${\sansLmirrored}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⅄</xml2tex:character>
         <xml2tex:string>${\Yup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⅅ</xml2tex:character>
         <xml2tex:string>${\CapitalDifferentialD}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⅆ</xml2tex:character>
         <xml2tex:string>${\DifferentialD}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⅇ</xml2tex:character>
         <xml2tex:string>${\ExponetialE}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⅈ</xml2tex:character>
         <xml2tex:string>${\ComplexI}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⅉ</xml2tex:character>
         <xml2tex:string>${\ComplexJ}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⅊</xml2tex:character>
         <xml2tex:string>${\PropertyLine}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⅋</xml2tex:character>
         <xml2tex:string>${\invamp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>←</xml2tex:character>
         <xml2tex:string>${\leftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↑</xml2tex:character>
         <xml2tex:string>${\uparrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>→</xml2tex:character>
         <xml2tex:string>${\rightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↓</xml2tex:character>
         <xml2tex:string>${\downarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↔</xml2tex:character>
         <xml2tex:string>${\leftrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↕</xml2tex:character>
         <xml2tex:string>${\updownarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↖</xml2tex:character>
         <xml2tex:string>${\nwarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↗</xml2tex:character>
         <xml2tex:string>${\nearrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↘</xml2tex:character>
         <xml2tex:string>${\searrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↙</xml2tex:character>
         <xml2tex:string>${\swarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↚</xml2tex:character>
         <xml2tex:string>${\nleftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↛</xml2tex:character>
         <xml2tex:string>${\nrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↞</xml2tex:character>
         <xml2tex:string>${\twoheadleftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↠</xml2tex:character>
         <xml2tex:string>${\twoheadrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↢</xml2tex:character>
         <xml2tex:string>${\leftarrowtail}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↣</xml2tex:character>
         <xml2tex:string>${\rightarrowtail}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↤</xml2tex:character>
         <xml2tex:string>${\mapsfrom}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↥</xml2tex:character>
         <xml2tex:string>${\MapsUp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↦</xml2tex:character>
         <xml2tex:string>${\mapsto}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↧</xml2tex:character>
         <xml2tex:string>${\MapsDown}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↨</xml2tex:character>
         <xml2tex:string>${\updownarrowbar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↩</xml2tex:character>
         <xml2tex:string>${\hookleftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↪</xml2tex:character>
         <xml2tex:string>${\hookrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↫</xml2tex:character>
         <xml2tex:string>${\looparrowleft}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↬</xml2tex:character>
         <xml2tex:string>${\looparrowright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↭</xml2tex:character>
         <xml2tex:string>${\leftrightsquigarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↮</xml2tex:character>
         <xml2tex:string>${\nleftrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↯</xml2tex:character>
         <xml2tex:string>${\lightning}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↰</xml2tex:character>
         <xml2tex:string>${\Lsh}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↱</xml2tex:character>
         <xml2tex:string>${\Rsh}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↲</xml2tex:character>
         <xml2tex:string>${\dlsh}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↳</xml2tex:character>
         <xml2tex:string>${\drsh}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↶</xml2tex:character>
         <xml2tex:string>${\curvearrowleft}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↷</xml2tex:character>
         <xml2tex:string>${\curvearrowright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↺</xml2tex:character>
         <xml2tex:string>${\circlearrowleft}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↻</xml2tex:character>
         <xml2tex:string>${\circlearrowright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↼</xml2tex:character>
         <xml2tex:string>${\leftharpoonup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↽</xml2tex:character>
         <xml2tex:string>${\leftharpoondown}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↾</xml2tex:character>
         <xml2tex:string>${\upharpoonright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>↿</xml2tex:character>
         <xml2tex:string>${\upharpoonleft}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇀</xml2tex:character>
         <xml2tex:string>${\rightharpoonup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇁</xml2tex:character>
         <xml2tex:string>${\rightharpoondown}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇂</xml2tex:character>
         <xml2tex:string>${\downharpoonright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇃</xml2tex:character>
         <xml2tex:string>${\downharpoonleft}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇄</xml2tex:character>
         <xml2tex:string>${\rightleftarrows}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇅</xml2tex:character>
         <xml2tex:string>${\updownarrows}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇆</xml2tex:character>
         <xml2tex:string>${\leftrightarrows}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇇</xml2tex:character>
         <xml2tex:string>${\leftleftarrows}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇈</xml2tex:character>
         <xml2tex:string>${\upuparrows}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇉</xml2tex:character>
         <xml2tex:string>${\rightrightarrows}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇊</xml2tex:character>
         <xml2tex:string>${\downdownarrows}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇋</xml2tex:character>
         <xml2tex:string>${\leftrightharpoons}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇌</xml2tex:character>
         <xml2tex:string>${\rightleftharpoons}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇍</xml2tex:character>
         <xml2tex:string>${\nLeftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇎</xml2tex:character>
         <xml2tex:string>${\nLeftrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇏</xml2tex:character>
         <xml2tex:string>${\nRightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇐</xml2tex:character>
         <xml2tex:string>${\Leftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇑</xml2tex:character>
         <xml2tex:string>${\Uparrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇒</xml2tex:character>
         <xml2tex:string>${\Rightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇓</xml2tex:character>
         <xml2tex:string>${\Downarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇔</xml2tex:character>
         <xml2tex:string>${\Leftrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇕</xml2tex:character>
         <xml2tex:string>${\Updownarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇖</xml2tex:character>
         <xml2tex:string>${\Nwarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇗</xml2tex:character>
         <xml2tex:string>${\Nearrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇘</xml2tex:character>
         <xml2tex:string>${\Searrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇙</xml2tex:character>
         <xml2tex:string>${\Swarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇚</xml2tex:character>
         <xml2tex:string>${\Lleftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇛</xml2tex:character>
         <xml2tex:string>${\Rrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇜</xml2tex:character>
         <xml2tex:string>${\leftsquigarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇝</xml2tex:character>
         <xml2tex:string>${\rightsquigarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇠</xml2tex:character>
         <xml2tex:string>${\dashleftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇢</xml2tex:character>
         <xml2tex:string>${\dashrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇤</xml2tex:character>
         <xml2tex:string>${\LeftArrowBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇥</xml2tex:character>
         <xml2tex:string>${\RightArrowBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇵</xml2tex:character>
         <xml2tex:string>${\downuparrows}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇸</xml2tex:character>
         <xml2tex:string>${\pfun}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇻</xml2tex:character>
         <xml2tex:string>${\ffun}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇽</xml2tex:character>
         <xml2tex:string>${\leftarrowtriangle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇾</xml2tex:character>
         <xml2tex:string>${\rightarrowtriangle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⇿</xml2tex:character>
         <xml2tex:string>${\leftrightarrowtriangle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∀</xml2tex:character>
         <xml2tex:string>${\forall}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∁</xml2tex:character>
         <xml2tex:string>${\complement}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∂</xml2tex:character>
         <xml2tex:string>${\partial}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∃</xml2tex:character>
         <xml2tex:string>${\exists}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∄</xml2tex:character>
         <xml2tex:string>${\nexists}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∅</xml2tex:character>
         <xml2tex:string>${\varnothing}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∆</xml2tex:character>
         <xml2tex:string>${\Updelta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]">
         <xml2tex:character>∆</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Updelta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]">
         <xml2tex:character>∆</xml2tex:character>
         <xml2tex:string>$\boldsymbol{\Delta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char context="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]">
         <xml2tex:character>∆</xml2tex:character>
         <xml2tex:string>${\Delta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∇</xml2tex:character>
         <xml2tex:string>${\nabla}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∈</xml2tex:character>
         <xml2tex:string>${\in}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∉</xml2tex:character>
         <xml2tex:string>${\notin}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∊</xml2tex:character>
         <xml2tex:string>${\in}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∋</xml2tex:character>
         <xml2tex:string>${\ni}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∌</xml2tex:character>
         <xml2tex:string>${\notni}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∍</xml2tex:character>
         <xml2tex:string>${\ni}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∎</xml2tex:character>
         <xml2tex:string>${\blacksquare}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∏</xml2tex:character>
         <xml2tex:string>${\prod}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∐</xml2tex:character>
         <xml2tex:string>${\coprod}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∑</xml2tex:character>
         <xml2tex:string>${\sum}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>−</xml2tex:character>
         <xml2tex:string>${-}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∓</xml2tex:character>
         <xml2tex:string>${\mp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∔</xml2tex:character>
         <xml2tex:string>${\dotplus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∕</xml2tex:character>
         <xml2tex:string>${\slash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∖</xml2tex:character>
         <xml2tex:string>${\smallsetminus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∗</xml2tex:character>
         <xml2tex:string>${\ast}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∘</xml2tex:character>
         <xml2tex:string>${\circ}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∙</xml2tex:character>
         <xml2tex:string>${\cdot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>√</xml2tex:character>
         <xml2tex:string>${\sqrt{}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∛</xml2tex:character>
         <xml2tex:string>${\sqrt[3]{}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∜</xml2tex:character>
         <xml2tex:string>${\sqrt[4]{}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∝</xml2tex:character>
         <xml2tex:string>${\propto}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∞</xml2tex:character>
         <xml2tex:string>${\infty}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∟</xml2tex:character>
         <xml2tex:string>${\llcorner}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∠</xml2tex:character>
         <xml2tex:string>${\angle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∡</xml2tex:character>
         <xml2tex:string>${\measuredangle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∢</xml2tex:character>
         <xml2tex:string>${\sphericalangle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∣</xml2tex:character>
         <xml2tex:string>${\mid}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∤</xml2tex:character>
         <xml2tex:string>${\nmid}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∥</xml2tex:character>
         <xml2tex:string>${\parallel}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∦</xml2tex:character>
         <xml2tex:string>${\nparallel}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∧</xml2tex:character>
         <xml2tex:string>${\wedge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∨</xml2tex:character>
         <xml2tex:string>${\vee}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∩</xml2tex:character>
         <xml2tex:string>${\cap}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∪</xml2tex:character>
         <xml2tex:string>${\cup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∫</xml2tex:character>
         <xml2tex:string>${\int}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∬</xml2tex:character>
         <xml2tex:string>${\iint}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∭</xml2tex:character>
         <xml2tex:string>${\iiint}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∮</xml2tex:character>
         <xml2tex:string>${\oint}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∯</xml2tex:character>
         <xml2tex:string>${\oiint}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∰</xml2tex:character>
         <xml2tex:string>${\oiiint}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∲</xml2tex:character>
         <xml2tex:string>${\varointclockwise}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∳</xml2tex:character>
         <xml2tex:string>${\ointctrclockwise}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∴</xml2tex:character>
         <xml2tex:string>${\therefore}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∵</xml2tex:character>
         <xml2tex:string>${\because}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∶</xml2tex:character>
         <xml2tex:string>${:}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∷</xml2tex:character>
         <xml2tex:string>${::}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∸</xml2tex:character>
         <xml2tex:string>${\dot{-}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∹</xml2tex:character>
         <xml2tex:string>${\eqcolon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∼</xml2tex:character>
         <xml2tex:string>${\sim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∽</xml2tex:character>
         <xml2tex:string>${\backsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>∿</xml2tex:character>
         <xml2tex:string>${\AC}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≀</xml2tex:character>
         <xml2tex:string>${\wr}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≁</xml2tex:character>
         <xml2tex:string>${\nsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≂</xml2tex:character>
         <xml2tex:string>${\eqsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≃</xml2tex:character>
         <xml2tex:string>${\simeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≄</xml2tex:character>
         <xml2tex:string>${\nsimeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≅</xml2tex:character>
         <xml2tex:string>${\cong}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≇</xml2tex:character>
         <xml2tex:string>${\ncong}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≈</xml2tex:character>
         <xml2tex:string>${\approx}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≉</xml2tex:character>
         <xml2tex:string>${\napprox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≊</xml2tex:character>
         <xml2tex:string>${\approxeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≍</xml2tex:character>
         <xml2tex:string>${\asymp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≎</xml2tex:character>
         <xml2tex:string>${\Bumpeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≏</xml2tex:character>
         <xml2tex:string>${\bumpeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≐</xml2tex:character>
         <xml2tex:string>${\doteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≑</xml2tex:character>
         <xml2tex:string>${\Doteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≒</xml2tex:character>
         <xml2tex:string>${\fallingdotseq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≓</xml2tex:character>
         <xml2tex:string>${\risingdotseq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≔</xml2tex:character>
         <xml2tex:string>${\coloneqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≕</xml2tex:character>
         <xml2tex:string>${\eqqcolon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≖</xml2tex:character>
         <xml2tex:string>${\eqcirc}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≗</xml2tex:character>
         <xml2tex:string>${\circeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≙</xml2tex:character>
         <xml2tex:string>$\hat{=}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≜</xml2tex:character>
         <xml2tex:string>${\triangleq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≠</xml2tex:character>
         <xml2tex:string>${\neq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≡</xml2tex:character>
         <xml2tex:string>${\equiv}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≢</xml2tex:character>
         <xml2tex:string>${\nequiv}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≤</xml2tex:character>
         <xml2tex:string>${\leq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≥</xml2tex:character>
         <xml2tex:string>${\geq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≦</xml2tex:character>
         <xml2tex:string>${\leqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≧</xml2tex:character>
         <xml2tex:string>${\geqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≨</xml2tex:character>
         <xml2tex:string>${\lneqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≩</xml2tex:character>
         <xml2tex:string>${\gneqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≪</xml2tex:character>
         <xml2tex:string>${\ll}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≫</xml2tex:character>
         <xml2tex:string>${\gg}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≬</xml2tex:character>
         <xml2tex:string>${\between}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≭</xml2tex:character>
         <xml2tex:string>${\notasymp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≮</xml2tex:character>
         <xml2tex:string>${\nless}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≯</xml2tex:character>
         <xml2tex:string>${\ngtr}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≰</xml2tex:character>
         <xml2tex:string>${\nleq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≱</xml2tex:character>
         <xml2tex:string>${\ngeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≲</xml2tex:character>
         <xml2tex:string>${\lesssim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≳</xml2tex:character>
         <xml2tex:string>${\gtrsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≴</xml2tex:character>
         <xml2tex:string>${\NotLessTilde}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≵</xml2tex:character>
         <xml2tex:string>${\NotGreaterTilde}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≶</xml2tex:character>
         <xml2tex:string>${\lessgtr}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≷</xml2tex:character>
         <xml2tex:string>${\gtrless}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≹</xml2tex:character>
         <xml2tex:string>${\NotGreaterLess}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≺</xml2tex:character>
         <xml2tex:string>${\prec}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≻</xml2tex:character>
         <xml2tex:string>${\succ}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≼</xml2tex:character>
         <xml2tex:string>${\preccurlyeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≽</xml2tex:character>
         <xml2tex:string>${\succcurlyeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≾</xml2tex:character>
         <xml2tex:string>${\precsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>≿</xml2tex:character>
         <xml2tex:string>${\succsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊀</xml2tex:character>
         <xml2tex:string>${\nprec}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊁</xml2tex:character>
         <xml2tex:string>${\nsucc}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊂</xml2tex:character>
         <xml2tex:string>${\subset}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊃</xml2tex:character>
         <xml2tex:string>${\supset}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊄</xml2tex:character>
         <xml2tex:string>${\nsubset}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊅</xml2tex:character>
         <xml2tex:string>${\nsupset}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊆</xml2tex:character>
         <xml2tex:string>${\subseteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊇</xml2tex:character>
         <xml2tex:string>${\supseteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊈</xml2tex:character>
         <xml2tex:string>${\nsubseteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊉</xml2tex:character>
         <xml2tex:string>${\nsupseteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊊</xml2tex:character>
         <xml2tex:string>${\subsetneq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊋</xml2tex:character>
         <xml2tex:string>${\supsetneq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊎</xml2tex:character>
         <xml2tex:string>${\uplus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊏</xml2tex:character>
         <xml2tex:string>${\sqsubset}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊐</xml2tex:character>
         <xml2tex:string>${\sqsupset}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊑</xml2tex:character>
         <xml2tex:string>${\sqsubseteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊒</xml2tex:character>
         <xml2tex:string>${\sqsupseteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊓</xml2tex:character>
         <xml2tex:string>${\sqcap}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊔</xml2tex:character>
         <xml2tex:string>${\sqcup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊕</xml2tex:character>
         <xml2tex:string>${\oplus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊖</xml2tex:character>
         <xml2tex:string>${\ominus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊗</xml2tex:character>
         <xml2tex:string>${\otimes}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊘</xml2tex:character>
         <xml2tex:string>${\oslash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊙</xml2tex:character>
         <xml2tex:string>${\odot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊚</xml2tex:character>
         <xml2tex:string>${\circledcirc}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊛</xml2tex:character>
         <xml2tex:string>${\circledast}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊝</xml2tex:character>
         <xml2tex:string>${\circleddash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊞</xml2tex:character>
         <xml2tex:string>${\boxplus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊟</xml2tex:character>
         <xml2tex:string>${\boxminus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊠</xml2tex:character>
         <xml2tex:string>${\boxtimes}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊡</xml2tex:character>
         <xml2tex:string>${\boxdot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊢</xml2tex:character>
         <xml2tex:string>${\vdash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊣</xml2tex:character>
         <xml2tex:string>${\dashv}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊤</xml2tex:character>
         <xml2tex:string>${\top}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊥</xml2tex:character>
         <xml2tex:string>${\bot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊧</xml2tex:character>
         <xml2tex:string>${\models}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊨</xml2tex:character>
         <xml2tex:string>${\vDash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊩</xml2tex:character>
         <xml2tex:string>${\Vdash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊪</xml2tex:character>
         <xml2tex:string>${\Vvdash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊫</xml2tex:character>
         <xml2tex:string>${\VDash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊬</xml2tex:character>
         <xml2tex:string>${\nvdash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊭</xml2tex:character>
         <xml2tex:string>${\nvDash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊮</xml2tex:character>
         <xml2tex:string>${\nVdash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊯</xml2tex:character>
         <xml2tex:string>${\nVDash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊲</xml2tex:character>
         <xml2tex:string>${\vartriangleleft}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊳</xml2tex:character>
         <xml2tex:string>${\vartriangleright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊴</xml2tex:character>
         <xml2tex:string>${\trianglelefteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊵</xml2tex:character>
         <xml2tex:string>${\trianglerighteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊶</xml2tex:character>
         <xml2tex:string>${\multimapdotbothA}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊷</xml2tex:character>
         <xml2tex:string>${\multimapdotbothB}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊸</xml2tex:character>
         <xml2tex:string>${\multimap}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊺</xml2tex:character>
         <xml2tex:string>${\intercal}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊻</xml2tex:character>
         <xml2tex:string>${\veebar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⊼</xml2tex:character>
         <xml2tex:string>${\barwedge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋀</xml2tex:character>
         <xml2tex:string>${\bigwedge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋁</xml2tex:character>
         <xml2tex:string>${\bigvee}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋂</xml2tex:character>
         <xml2tex:string>${\bigcap}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋃</xml2tex:character>
         <xml2tex:string>${\bigcup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋄</xml2tex:character>
         <xml2tex:string>${\diamond}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋅</xml2tex:character>
         <xml2tex:string>${\cdot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋆</xml2tex:character>
         <xml2tex:string>${\star}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋇</xml2tex:character>
         <xml2tex:string>${\divideontimes}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋈</xml2tex:character>
         <xml2tex:string>${\bowtie}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋉</xml2tex:character>
         <xml2tex:string>${\ltimes}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋊</xml2tex:character>
         <xml2tex:string>${\rtimes}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋋</xml2tex:character>
         <xml2tex:string>${\leftthreetimes}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋌</xml2tex:character>
         <xml2tex:string>${\rightthreetimes}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋍</xml2tex:character>
         <xml2tex:string>${\backsimeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋎</xml2tex:character>
         <xml2tex:string>${\curlyvee}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋏</xml2tex:character>
         <xml2tex:string>${\curlywedge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋐</xml2tex:character>
         <xml2tex:string>${\Subset}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋑</xml2tex:character>
         <xml2tex:string>${\Supset}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋒</xml2tex:character>
         <xml2tex:string>${\Cap}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋓</xml2tex:character>
         <xml2tex:string>${\Cup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋔</xml2tex:character>
         <xml2tex:string>${\pitchfork}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋕</xml2tex:character>
         <xml2tex:string>${\hash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋖</xml2tex:character>
         <xml2tex:string>${\lessdot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋗</xml2tex:character>
         <xml2tex:string>${\gtrdot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋘</xml2tex:character>
         <xml2tex:string>${\lll}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋙</xml2tex:character>
         <xml2tex:string>${\ggg}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋚</xml2tex:character>
         <xml2tex:string>${\lesseqgtr}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋛</xml2tex:character>
         <xml2tex:string>${\gtreqless}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋞</xml2tex:character>
         <xml2tex:string>${\curlyeqprec}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋟</xml2tex:character>
         <xml2tex:string>${\curlyeqsucc}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋠</xml2tex:character>
         <xml2tex:string>${\npreceq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋡</xml2tex:character>
         <xml2tex:string>${\nsucceq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋢</xml2tex:character>
         <xml2tex:string>${\nsqsubseteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋣</xml2tex:character>
         <xml2tex:string>${\nsqsupseteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋦</xml2tex:character>
         <xml2tex:string>${\lnsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋧</xml2tex:character>
         <xml2tex:string>${\gnsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋨</xml2tex:character>
         <xml2tex:string>${\precnsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋩</xml2tex:character>
         <xml2tex:string>${\succnsim}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋪</xml2tex:character>
         <xml2tex:string>${\ntriangleleft}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋫</xml2tex:character>
         <xml2tex:string>${\ntriangleright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋬</xml2tex:character>
         <xml2tex:string>${\ntrianglelefteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋭</xml2tex:character>
         <xml2tex:string>${\ntrianglerighteq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋮</xml2tex:character>
         <xml2tex:string>${\vdots}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋯</xml2tex:character>
         <xml2tex:string>${\cdots}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋰</xml2tex:character>
         <xml2tex:string>${\adots}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋱</xml2tex:character>
         <xml2tex:string>${\ddots}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⋶</xml2tex:character>
         <xml2tex:string>${\barin}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌀</xml2tex:character>
         <xml2tex:string>${\diameter}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌂</xml2tex:character>
         <xml2tex:string>${\house}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌈</xml2tex:character>
         <xml2tex:string>${\lceil}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌉</xml2tex:character>
         <xml2tex:string>${\rceil}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌐</xml2tex:character>
         <xml2tex:string>${\invneg}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌑</xml2tex:character>
         <xml2tex:string>${\wasylozenge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌒</xml2tex:character>
         <xml2tex:string>${\profline}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌓</xml2tex:character>
         <xml2tex:string>${\profsurf}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌗</xml2tex:character>
         <xml2tex:string>${\viewdata}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌙</xml2tex:character>
         <xml2tex:string>${\turnednot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌠</xml2tex:character>
         <xml2tex:string>${\inttop}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌡</xml2tex:character>
         <xml2tex:string>${\intbottom}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌊</xml2tex:character>
         <xml2tex:string>${\lfloor}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌋</xml2tex:character>
         <xml2tex:string>${\rfloor}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌜</xml2tex:character>
         <xml2tex:string>${\ulcorner}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌝</xml2tex:character>
         <xml2tex:string>${\urcorner}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌞</xml2tex:character>
         <xml2tex:string>${\llcorner}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌟</xml2tex:character>
         <xml2tex:string>${\lrcorner}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌢</xml2tex:character>
         <xml2tex:string>${\frown}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌣</xml2tex:character>
         <xml2tex:string>${\smile}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>〈</xml2tex:character>
         <xml2tex:string>${\langle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>〉</xml2tex:character>
         <xml2tex:string>${\rangle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌬</xml2tex:character>
         <xml2tex:string>${\varhexagonlrbonds}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌲</xml2tex:character>
         <xml2tex:string>${\conictaper}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌶</xml2tex:character>
         <xml2tex:string>${\topbot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌹</xml2tex:character>
         <xml2tex:string>${\APLinv}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍀</xml2tex:character>
         <xml2tex:string>${\APLnotbackslash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⌿</xml2tex:character>
         <xml2tex:string>${\notslash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍀</xml2tex:character>
         <xml2tex:string>${\notbackslash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍇</xml2tex:character>
         <xml2tex:string>${\APLleftarrowbox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍈</xml2tex:character>
         <xml2tex:string>${\APLrightarrowbox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍐</xml2tex:character>
         <xml2tex:string>${\APLuparrowbox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍓</xml2tex:character>
         <xml2tex:string>${\APLboxupcaret}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍗</xml2tex:character>
         <xml2tex:string>${\APLdownarrowbox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍝</xml2tex:character>
         <xml2tex:string>${\APLcomment}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍞</xml2tex:character>
         <xml2tex:string>${\APLinput}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍟</xml2tex:character>
         <xml2tex:string>${\APLlog}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍰</xml2tex:character>
         <xml2tex:string>${\APLboxquestion}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍺</xml2tex:character>
         <xml2tex:string>${\upalpha}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⍼</xml2tex:character>
         <xml2tex:string>${\rangledownzigzagarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⎔</xml2tex:character>
         <xml2tex:string>${\hexagon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⏜</xml2tex:character>
         <xml2tex:string>${\overparen}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⏝</xml2tex:character>
         <xml2tex:string>${\underparen}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⏞</xml2tex:character>
         <xml2tex:string>${\overbrace}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⏟</xml2tex:character>
         <xml2tex:string>${\underbrace}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>␣</xml2tex:character>
         <xml2tex:string>{\textvisiblespace}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>①</xml2tex:character>
         <xml2tex:string>\ding{172}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>②</xml2tex:character>
         <xml2tex:string>\ding{173}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>③</xml2tex:character>
         <xml2tex:string>\ding{174}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>④</xml2tex:character>
         <xml2tex:string>\ding{175}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑤</xml2tex:character>
         <xml2tex:string>\ding{176}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑥</xml2tex:character>
         <xml2tex:string>\ding{177}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑦</xml2tex:character>
         <xml2tex:string>\ding{178}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑧</xml2tex:character>
         <xml2tex:string>\ding{179}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑨</xml2tex:character>
         <xml2tex:string>\ding{180}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑩</xml2tex:character>
         <xml2tex:string>\ding{181}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑪</xml2tex:character>
         <xml2tex:string>\ding{172}\ding{172}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑫</xml2tex:character>
         <xml2tex:string>\ding{172}\ding{173}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑬</xml2tex:character>
         <xml2tex:string>\ding{172}\ding{174}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑭</xml2tex:character>
         <xml2tex:string>\ding{172}\ding{175}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑮</xml2tex:character>
         <xml2tex:string>\ding{172}\ding{176}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑯</xml2tex:character>
         <xml2tex:string>\ding{172}\ding{177}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑰</xml2tex:character>
         <xml2tex:string>\ding{172}\ding{178}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑱</xml2tex:character>
         <xml2tex:string>\ding{172}\ding{179}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑲</xml2tex:character>
         <xml2tex:string>\ding{172}\ding{180}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑳</xml2tex:character>
         <xml2tex:string>\ding{173}\ding{173}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑴</xml2tex:character>
         <xml2tex:string>(1)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑵</xml2tex:character>
         <xml2tex:string>(2)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑶</xml2tex:character>
         <xml2tex:string>(3)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑷</xml2tex:character>
         <xml2tex:string>(4)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑸</xml2tex:character>
         <xml2tex:string>(5)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑹</xml2tex:character>
         <xml2tex:string>(6)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑺</xml2tex:character>
         <xml2tex:string>(7)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑻</xml2tex:character>
         <xml2tex:string>(8)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑼</xml2tex:character>
         <xml2tex:string>(9)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑽</xml2tex:character>
         <xml2tex:string>(10)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑾</xml2tex:character>
         <xml2tex:string>(11)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⑿</xml2tex:character>
         <xml2tex:string>(12)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒀</xml2tex:character>
         <xml2tex:string>(13)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒁</xml2tex:character>
         <xml2tex:string>(14)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒂</xml2tex:character>
         <xml2tex:string>(15)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒃</xml2tex:character>
         <xml2tex:string>(16)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒄</xml2tex:character>
         <xml2tex:string>(17)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒅</xml2tex:character>
         <xml2tex:string>(18)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒆</xml2tex:character>
         <xml2tex:string>(19)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒇</xml2tex:character>
         <xml2tex:string>(20)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒈</xml2tex:character>
         <xml2tex:string>1.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒉</xml2tex:character>
         <xml2tex:string>2.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒊</xml2tex:character>
         <xml2tex:string>3.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒋</xml2tex:character>
         <xml2tex:string>4.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒌</xml2tex:character>
         <xml2tex:string>5.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒍</xml2tex:character>
         <xml2tex:string>6.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒎</xml2tex:character>
         <xml2tex:string>7.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒏</xml2tex:character>
         <xml2tex:string>8.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒐</xml2tex:character>
         <xml2tex:string>9.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒑</xml2tex:character>
         <xml2tex:string>10.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒒</xml2tex:character>
         <xml2tex:string>11.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒓</xml2tex:character>
         <xml2tex:string>12.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒔</xml2tex:character>
         <xml2tex:string>13.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒕</xml2tex:character>
         <xml2tex:string>14.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒖</xml2tex:character>
         <xml2tex:string>15.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒗</xml2tex:character>
         <xml2tex:string>16.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒘</xml2tex:character>
         <xml2tex:string>17.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒙</xml2tex:character>
         <xml2tex:string>18.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒚</xml2tex:character>
         <xml2tex:string>19.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒛</xml2tex:character>
         <xml2tex:string>20.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒜</xml2tex:character>
         <xml2tex:string>(a)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒝</xml2tex:character>
         <xml2tex:string>(b)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒞</xml2tex:character>
         <xml2tex:string>(c)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒟</xml2tex:character>
         <xml2tex:string>(d)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒠</xml2tex:character>
         <xml2tex:string>(e)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒡</xml2tex:character>
         <xml2tex:string>(f)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒢</xml2tex:character>
         <xml2tex:string>(g)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒣</xml2tex:character>
         <xml2tex:string>(h)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒤</xml2tex:character>
         <xml2tex:string>(i)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒥</xml2tex:character>
         <xml2tex:string>(j)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒦</xml2tex:character>
         <xml2tex:string>(k)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒧</xml2tex:character>
         <xml2tex:string>(l)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒨</xml2tex:character>
         <xml2tex:string>(m)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒩</xml2tex:character>
         <xml2tex:string>(n)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒪</xml2tex:character>
         <xml2tex:string>(o)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒫</xml2tex:character>
         <xml2tex:string>(p)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒬</xml2tex:character>
         <xml2tex:string>(q)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒭</xml2tex:character>
         <xml2tex:string>(r)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒮</xml2tex:character>
         <xml2tex:string>(s)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒯</xml2tex:character>
         <xml2tex:string>(t)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒰</xml2tex:character>
         <xml2tex:string>(u)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒱</xml2tex:character>
         <xml2tex:string>(v)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒲</xml2tex:character>
         <xml2tex:string>(w)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒳</xml2tex:character>
         <xml2tex:string>(x)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒴</xml2tex:character>
         <xml2tex:string>(y)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⒵</xml2tex:character>
         <xml2tex:string>(z)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓐ</xml2tex:character>
         <xml2tex:string>\textcircled(A)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓑ</xml2tex:character>
         <xml2tex:string>\textcircled(B)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓒ</xml2tex:character>
         <xml2tex:string>\textcircled(C)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓓ</xml2tex:character>
         <xml2tex:string>\textcircled(D)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓔ</xml2tex:character>
         <xml2tex:string>\textcircled(E)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓕ</xml2tex:character>
         <xml2tex:string>\textcircled(F)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓖ</xml2tex:character>
         <xml2tex:string>\textcircled(G)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓗ</xml2tex:character>
         <xml2tex:string>\textcircled(H)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓘ</xml2tex:character>
         <xml2tex:string>\textcircled(I)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓙ</xml2tex:character>
         <xml2tex:string>\textcircled(J)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓚ</xml2tex:character>
         <xml2tex:string>\textcircled(K)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓛ</xml2tex:character>
         <xml2tex:string>\textcircled(L)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓜ</xml2tex:character>
         <xml2tex:string>\textcircled(M)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓝ</xml2tex:character>
         <xml2tex:string>\textcircled(N)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓞ</xml2tex:character>
         <xml2tex:string>\textcircled(O)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓟ</xml2tex:character>
         <xml2tex:string>\textcircled(P)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓠ</xml2tex:character>
         <xml2tex:string>\textcircled(Q)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓡ</xml2tex:character>
         <xml2tex:string>\textcircled(R)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓢ</xml2tex:character>
         <xml2tex:string>\textcircled(S)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓣ</xml2tex:character>
         <xml2tex:string>\textcircled(T)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓤ</xml2tex:character>
         <xml2tex:string>\textcircled(U)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓥ</xml2tex:character>
         <xml2tex:string>\textcircled(V)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓦ</xml2tex:character>
         <xml2tex:string>\textcircled(W)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓧ</xml2tex:character>
         <xml2tex:string>\textcircled(X)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓨ</xml2tex:character>
         <xml2tex:string>\textcircled(Y)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>Ⓩ</xml2tex:character>
         <xml2tex:string>\textcircled(Z)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓐ</xml2tex:character>
         <xml2tex:string>\textcircled(a)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓑ</xml2tex:character>
         <xml2tex:string>\textcircled(b)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓒ</xml2tex:character>
         <xml2tex:string>\textcircled(c)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓓ</xml2tex:character>
         <xml2tex:string>\textcircled(d)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓔ</xml2tex:character>
         <xml2tex:string>\textcircled(e)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓕ</xml2tex:character>
         <xml2tex:string>\textcircled(f)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓖ</xml2tex:character>
         <xml2tex:string>\textcircled(g)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓗ</xml2tex:character>
         <xml2tex:string>\textcircled(h)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓘ</xml2tex:character>
         <xml2tex:string>\textcircled(i)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓙ</xml2tex:character>
         <xml2tex:string>\textcircled(j)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓚ</xml2tex:character>
         <xml2tex:string>\textcircled(k)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓛ</xml2tex:character>
         <xml2tex:string>\textcircled(l)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓜ</xml2tex:character>
         <xml2tex:string>\textcircled(m)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓝ</xml2tex:character>
         <xml2tex:string>\textcircled(b)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓞ</xml2tex:character>
         <xml2tex:string>\textcircled(o)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓟ</xml2tex:character>
         <xml2tex:string>\textcircled(p)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓠ</xml2tex:character>
         <xml2tex:string>\textcircled(q)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓡ</xml2tex:character>
         <xml2tex:string>\textcircled(r)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓢ</xml2tex:character>
         <xml2tex:string>\textcircled(s)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓣ</xml2tex:character>
         <xml2tex:string>\textcircled(t)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓤ</xml2tex:character>
         <xml2tex:string>\textcircled(u)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓥ</xml2tex:character>
         <xml2tex:string>\textcircled(v)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓦ</xml2tex:character>
         <xml2tex:string>\textcircled(w)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓧ</xml2tex:character>
         <xml2tex:string>\textcircled(x)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓨ</xml2tex:character>
         <xml2tex:string>\textcircled(y)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>ⓩ</xml2tex:character>
         <xml2tex:string>\textcircled(z)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓪</xml2tex:character>
         <xml2tex:string>\textcircled(0)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓫</xml2tex:character>
         <xml2tex:string>\ding{182}\ding{182}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓬</xml2tex:character>
         <xml2tex:string>\ding{182}\ding{183}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓭</xml2tex:character>
         <xml2tex:string>\ding{182}\ding{184}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓮</xml2tex:character>
         <xml2tex:string>\ding{182}\ding{185}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓯</xml2tex:character>
         <xml2tex:string>\ding{182}\ding{186}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓰</xml2tex:character>
         <xml2tex:string>\ding{182}\ding{187}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓱</xml2tex:character>
         <xml2tex:string>\ding{182}\ding{188}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓲</xml2tex:character>
         <xml2tex:string>\ding{182}\ding{189}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓳</xml2tex:character>
         <xml2tex:string>\ding{182}\ding{190}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓴</xml2tex:character>
         <xml2tex:string>\ding{183}\ding{183}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓵</xml2tex:character>
         <xml2tex:string>\ding{172}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓶</xml2tex:character>
         <xml2tex:string>\ding{173}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓷</xml2tex:character>
         <xml2tex:string>\ding{174}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓸</xml2tex:character>
         <xml2tex:string>\ding{175}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓹</xml2tex:character>
         <xml2tex:string>\ding{176}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓺</xml2tex:character>
         <xml2tex:string>\ding{177}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓻</xml2tex:character>
         <xml2tex:string>\ding{178}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓼</xml2tex:character>
         <xml2tex:string>\ding{179}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓽</xml2tex:character>
         <xml2tex:string>\ding{180}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓾</xml2tex:character>
         <xml2tex:string>\ding{181}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⓿</xml2tex:character>
         <xml2tex:string>\textcircled{0}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>│</xml2tex:character>
         <xml2tex:string>{\textbar}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>■</xml2tex:character>
         <xml2tex:string>${\blacksquare}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>□</xml2tex:character>
         <xml2tex:string>${\square}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▪</xml2tex:character>
         <xml2tex:string>${\blacksquare}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>△</xml2tex:character>
         <xml2tex:string>${\bigtriangleup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▴</xml2tex:character>
         <xml2tex:string>${\blacktriangleup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▵</xml2tex:character>
         <xml2tex:string>${\smalltriangleup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▶</xml2tex:character>
         <xml2tex:string>${\RHD}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▷</xml2tex:character>
         <xml2tex:string>${\rhd}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▸</xml2tex:character>
         <xml2tex:string>${\blacktriangleright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▹</xml2tex:character>
         <xml2tex:string>${\smalltriangleright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▽</xml2tex:character>
         <xml2tex:string>${\bigtriangledown}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▾</xml2tex:character>
         <xml2tex:string>${\blacktriangledown}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>▿</xml2tex:character>
         <xml2tex:string>${\smalltriangledown}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◀</xml2tex:character>
         <xml2tex:string>${\LHD}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◁</xml2tex:character>
         <xml2tex:string>${\lhd}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◂</xml2tex:character>
         <xml2tex:string>${\blacktriangleleft}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◃</xml2tex:character>
         <xml2tex:string>${\smalltriangleleft}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◆</xml2tex:character>
         <xml2tex:string>${\Diamondblack}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◇</xml2tex:character>
         <xml2tex:string>${\Diamond}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◊</xml2tex:character>
         <xml2tex:string>${\lozenge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>○</xml2tex:character>
         <xml2tex:string>${\Circle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>●</xml2tex:character>
         <xml2tex:string>${\CIRCLE}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◐</xml2tex:character>
         <xml2tex:string>${\LEFTcircle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◑</xml2tex:character>
         <xml2tex:string>${\RIGHTcircle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◖</xml2tex:character>
         <xml2tex:string>${\LEFTCIRCLE}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◗</xml2tex:character>
         <xml2tex:string>${\RIGHTCIRCLE}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◫</xml2tex:character>
         <xml2tex:string>${\boxbar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◻</xml2tex:character>
         <xml2tex:string>${\square}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>◼</xml2tex:character>
         <xml2tex:string>${\blacksquare}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>★</xml2tex:character>
         <xml2tex:string>${\bigstar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☉</xml2tex:character>
         <xml2tex:string>${\Sun}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☎</xml2tex:character>
         <xml2tex:string>\ding{37}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☏</xml2tex:character>
         <xml2tex:string>\ding{37}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☐</xml2tex:character>
         <xml2tex:string>${\Square}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☑</xml2tex:character>
         <xml2tex:string>${\CheckedBox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☒</xml2tex:character>
         <xml2tex:string>${\XBox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☕</xml2tex:character>
         <xml2tex:string>${\steaming}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☞</xml2tex:character>
         <xml2tex:string>${\pointright}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☠</xml2tex:character>
         <xml2tex:string>${\skull}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☢</xml2tex:character>
         <xml2tex:string>${\radiation}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☣</xml2tex:character>
         <xml2tex:string>${\biohazard}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☯</xml2tex:character>
         <xml2tex:string>${\yinyang}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☹</xml2tex:character>
         <xml2tex:string>${\frownie}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☺</xml2tex:character>
         <xml2tex:string>${\smiley}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☻</xml2tex:character>
         <xml2tex:string>${\blacksmiley}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☼</xml2tex:character>
         <xml2tex:string>${\sun}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☽</xml2tex:character>
         <xml2tex:string>${\rightmoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☾</xml2tex:character>
         <xml2tex:string>${\leftmoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>☿</xml2tex:character>
         <xml2tex:string>${\mercury}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♀</xml2tex:character>
         <xml2tex:string>${\female}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♁</xml2tex:character>
         <xml2tex:string>${\earth}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♂</xml2tex:character>
         <xml2tex:string>${\male}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♃</xml2tex:character>
         <xml2tex:string>${\jupiter}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♄</xml2tex:character>
         <xml2tex:string>${\saturn}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♅</xml2tex:character>
         <xml2tex:string>${\uranus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♆</xml2tex:character>
         <xml2tex:string>${\neptune}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♇</xml2tex:character>
         <xml2tex:string>${\pluto}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♈</xml2tex:character>
         <xml2tex:string>${\aries}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♉</xml2tex:character>
         <xml2tex:string>${\taurus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♊</xml2tex:character>
         <xml2tex:string>${\gemini}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♋</xml2tex:character>
         <xml2tex:string>${\cancer}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♌</xml2tex:character>
         <xml2tex:string>${\leo}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♍</xml2tex:character>
         <xml2tex:string>${\virgo}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♎</xml2tex:character>
         <xml2tex:string>${\libra}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♏</xml2tex:character>
         <xml2tex:string>${\scorpio}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♐</xml2tex:character>
         <xml2tex:string>${\sagittarius}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♑</xml2tex:character>
         <xml2tex:string>${\capricornus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♒</xml2tex:character>
         <xml2tex:string>${\aquarius}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♓</xml2tex:character>
         <xml2tex:string>${\pisces}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♠</xml2tex:character>
         <xml2tex:string>${\spadesuit}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♡</xml2tex:character>
         <xml2tex:string>${\heartsuit}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♢</xml2tex:character>
         <xml2tex:string>${\diamondsuit}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♣</xml2tex:character>
         <xml2tex:string>${\clubsuit}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♤</xml2tex:character>
         <xml2tex:string>${\varspadesuit}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♥</xml2tex:character>
         <xml2tex:string>${\varheartsuit}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♦</xml2tex:character>
         <xml2tex:string>${\blacklozenge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♧</xml2tex:character>
         <xml2tex:string>${\varclubsuit}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♩</xml2tex:character>
         <xml2tex:string>${\quarternote}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♪</xml2tex:character>
         <xml2tex:string>${\eighthnote}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♫</xml2tex:character>
         <xml2tex:string>${\twonotes}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♬</xml2tex:character>
         <xml2tex:string>${\sixteenthnote}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♭</xml2tex:character>
         <xml2tex:string>${\flat}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♮</xml2tex:character>
         <xml2tex:string>${\natural}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♯</xml2tex:character>
         <xml2tex:string>${\sharp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>♻</xml2tex:character>
         <xml2tex:string>${\recycle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⚓</xml2tex:character>
         <xml2tex:string>${\anchor}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⚔</xml2tex:character>
         <xml2tex:string>${\swords}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⚠</xml2tex:character>
         <xml2tex:string>${\warning}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⚪</xml2tex:character>
         <xml2tex:string>${\medcirc}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⚫</xml2tex:character>
         <xml2tex:string>${\medbullet}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✀</xml2tex:character>
         <xml2tex:string>\ding{34}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✁</xml2tex:character>
         <xml2tex:string>\ding{33}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✂</xml2tex:character>
         <xml2tex:string>\ding{34}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✃</xml2tex:character>
         <xml2tex:string>\ding{35}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✄</xml2tex:character>
         <xml2tex:string>\ding{36}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✅</xml2tex:character>
         <xml2tex:string>\ding{52}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✆</xml2tex:character>
         <xml2tex:string>\ding{38}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✇</xml2tex:character>
         <xml2tex:string>\ding{39}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✈</xml2tex:character>
         <xml2tex:string>\ding{40}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✉</xml2tex:character>
         <xml2tex:string>\ding{41}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✊</xml2tex:character>
         <xml2tex:string>\ding{42}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✋</xml2tex:character>
         <xml2tex:string>\ding{43}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✌</xml2tex:character>
         <xml2tex:string>\ding{44}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✍</xml2tex:character>
         <xml2tex:string>\ding{45}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✎</xml2tex:character>
         <xml2tex:string>\ding{46}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✏</xml2tex:character>
         <xml2tex:string>\ding{47}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✐</xml2tex:character>
         <xml2tex:string>\ding{48}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✑</xml2tex:character>
         <xml2tex:string>\ding{49}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✒</xml2tex:character>
         <xml2tex:string>\ding{50}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✓</xml2tex:character>
         <xml2tex:string>\ding{51}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✔</xml2tex:character>
         <xml2tex:string>\ding{52}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✕</xml2tex:character>
         <xml2tex:string>\ding{53}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✖</xml2tex:character>
         <xml2tex:string>\ding{54}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✗</xml2tex:character>
         <xml2tex:string>\ding{55}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✘</xml2tex:character>
         <xml2tex:string>\ding{56}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✙</xml2tex:character>
         <xml2tex:string>\ding{57}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✚</xml2tex:character>
         <xml2tex:string>\ding{58}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✛</xml2tex:character>
         <xml2tex:string>\ding{59}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✜</xml2tex:character>
         <xml2tex:string>\ding{60}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✝</xml2tex:character>
         <xml2tex:string>\ding{61}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✞</xml2tex:character>
         <xml2tex:string>\ding{62}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✟</xml2tex:character>
         <xml2tex:string>\ding{63}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✠</xml2tex:character>
         <xml2tex:string>\ding{64}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✡</xml2tex:character>
         <xml2tex:string>\ding{65}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✢</xml2tex:character>
         <xml2tex:string>\ding{66}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✣</xml2tex:character>
         <xml2tex:string>\ding{67}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✤</xml2tex:character>
         <xml2tex:string>\ding{68}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✥</xml2tex:character>
         <xml2tex:string>\ding{69}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✦</xml2tex:character>
         <xml2tex:string>\ding{70}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✧</xml2tex:character>
         <xml2tex:string>\ding{71}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✨</xml2tex:character>
         <xml2tex:string>\ding{72}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✩</xml2tex:character>
         <xml2tex:string>\ding{73}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✪</xml2tex:character>
         <xml2tex:string>\ding{74}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✫</xml2tex:character>
         <xml2tex:string>\ding{75}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✬</xml2tex:character>
         <xml2tex:string>\ding{76}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✭</xml2tex:character>
         <xml2tex:string>\ding{77}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✮</xml2tex:character>
         <xml2tex:string>\ding{78}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✯</xml2tex:character>
         <xml2tex:string>\ding{79}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✰</xml2tex:character>
         <xml2tex:string>\ding{80}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✱</xml2tex:character>
         <xml2tex:string>\ding{81}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✲</xml2tex:character>
         <xml2tex:string>\ding{82}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✳</xml2tex:character>
         <xml2tex:string>\ding{83}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✴</xml2tex:character>
         <xml2tex:string>\ding{84}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✵</xml2tex:character>
         <xml2tex:string>\ding{85}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✶</xml2tex:character>
         <xml2tex:string>\ding{86}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✷</xml2tex:character>
         <xml2tex:string>\ding{87}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✸</xml2tex:character>
         <xml2tex:string>\ding{88}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✹</xml2tex:character>
         <xml2tex:string>\ding{89}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✺</xml2tex:character>
         <xml2tex:string>\ding{90}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✻</xml2tex:character>
         <xml2tex:string>\ding{91}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✼</xml2tex:character>
         <xml2tex:string>\ding{92}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✽</xml2tex:character>
         <xml2tex:string>\ding{93}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✾</xml2tex:character>
         <xml2tex:string>\ding{94}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>✿</xml2tex:character>
         <xml2tex:string>\ding{95}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❀</xml2tex:character>
         <xml2tex:string>\ding{96}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❁</xml2tex:character>
         <xml2tex:string>\ding{97}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❂</xml2tex:character>
         <xml2tex:string>\ding{98}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❃</xml2tex:character>
         <xml2tex:string>\ding{99}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❄</xml2tex:character>
         <xml2tex:string>\ding{100}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❅</xml2tex:character>
         <xml2tex:string>\ding{101}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❆</xml2tex:character>
         <xml2tex:string>\ding{102}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❇</xml2tex:character>
         <xml2tex:string>\ding{103}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❈</xml2tex:character>
         <xml2tex:string>\ding{104}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❉</xml2tex:character>
         <xml2tex:string>\ding{105}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❊</xml2tex:character>
         <xml2tex:string>\ding{106}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❋</xml2tex:character>
         <xml2tex:string>\ding{107}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❌</xml2tex:character>
         <xml2tex:string>\ding{53}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❍</xml2tex:character>
         <xml2tex:string>\ding{109}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❎</xml2tex:character>
         <xml2tex:string>\ding{53}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❏</xml2tex:character>
         <xml2tex:string>\ding{111}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❐</xml2tex:character>
         <xml2tex:string>\ding{112}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❑</xml2tex:character>
         <xml2tex:string>\ding{113}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❒</xml2tex:character>
         <xml2tex:string>\ding{114}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❓</xml2tex:character>
         <xml2tex:string>?</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❔</xml2tex:character>
         <xml2tex:string>?</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❕</xml2tex:character>
         <xml2tex:string>!</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❖</xml2tex:character>
         <xml2tex:string>\ding{118}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❗</xml2tex:character>
         <xml2tex:string>!</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❘</xml2tex:character>
         <xml2tex:string>\ding{120}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❙</xml2tex:character>
         <xml2tex:string>\ding{121}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❚</xml2tex:character>
         <xml2tex:string>\ding{122}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❛</xml2tex:character>
         <xml2tex:string>\ding{123}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❜</xml2tex:character>
         <xml2tex:string>\ding{124}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❝</xml2tex:character>
         <xml2tex:string>\ding{125}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❞</xml2tex:character>
         <xml2tex:string>\ding{126}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❟</xml2tex:character>
         <xml2tex:string>\raisebox{-1ex}{\ding{124}}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❠</xml2tex:character>
         <xml2tex:string>\raisebox{-1ex}{\ding{126}}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❡</xml2tex:character>
         <xml2tex:string>\ding{161}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❢</xml2tex:character>
         <xml2tex:string>\ding{162}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❣</xml2tex:character>
         <xml2tex:string>\ding{163}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❤</xml2tex:character>
         <xml2tex:string>\ding{164}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❥</xml2tex:character>
         <xml2tex:string>\ding{165}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❦</xml2tex:character>
         <xml2tex:string>\ding{166}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❧</xml2tex:character>
         <xml2tex:string>\ding{167}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❨</xml2tex:character>
         <xml2tex:string>\(</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❩</xml2tex:character>
         <xml2tex:string>\)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❪</xml2tex:character>
         <xml2tex:string>\(</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❫</xml2tex:character>
         <xml2tex:string>\)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❬</xml2tex:character>
         <xml2tex:string>\(</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❭</xml2tex:character>
         <xml2tex:string>\)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❰</xml2tex:character>
         <xml2tex:string>{\flq}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❱</xml2tex:character>
         <xml2tex:string>{\frq}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❲</xml2tex:character>
         <xml2tex:string>\[</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❳</xml2tex:character>
         <xml2tex:string>\]</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❴</xml2tex:character>
         <xml2tex:string>\{</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❵</xml2tex:character>
         <xml2tex:string>\}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❶</xml2tex:character>
         <xml2tex:string>\ding{182}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❷</xml2tex:character>
         <xml2tex:string>\ding{183}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❸</xml2tex:character>
         <xml2tex:string>\ding{184}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❹</xml2tex:character>
         <xml2tex:string>\ding{185}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❺</xml2tex:character>
         <xml2tex:string>\ding{186}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❻</xml2tex:character>
         <xml2tex:string>\ding{187}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❼</xml2tex:character>
         <xml2tex:string>\ding{188}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❽</xml2tex:character>
         <xml2tex:string>\ding{189}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❾</xml2tex:character>
         <xml2tex:string>\ding{190}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>❿</xml2tex:character>
         <xml2tex:string>\ding{191}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➀</xml2tex:character>
         <xml2tex:string>\ding{192}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➁</xml2tex:character>
         <xml2tex:string>\ding{193}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➂</xml2tex:character>
         <xml2tex:string>\ding{194}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➃</xml2tex:character>
         <xml2tex:string>\ding{195}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➄</xml2tex:character>
         <xml2tex:string>\ding{196}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➅</xml2tex:character>
         <xml2tex:string>\ding{197}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➆</xml2tex:character>
         <xml2tex:string>\ding{198}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➇</xml2tex:character>
         <xml2tex:string>\ding{199}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➈</xml2tex:character>
         <xml2tex:string>\ding{200}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➉</xml2tex:character>
         <xml2tex:string>\ding{201}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➊</xml2tex:character>
         <xml2tex:string>\ding{202}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➋</xml2tex:character>
         <xml2tex:string>\ding{203}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➌</xml2tex:character>
         <xml2tex:string>\ding{204}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➍</xml2tex:character>
         <xml2tex:string>\ding{205}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➎</xml2tex:character>
         <xml2tex:string>\ding{206}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➏</xml2tex:character>
         <xml2tex:string>\ding{207}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➐</xml2tex:character>
         <xml2tex:string>\ding{208}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➑</xml2tex:character>
         <xml2tex:string>\ding{209}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➒</xml2tex:character>
         <xml2tex:string>\ding{210}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➓</xml2tex:character>
         <xml2tex:string>\ding{211}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➔</xml2tex:character>
         <xml2tex:string>\ding{212}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➕</xml2tex:character>
         <xml2tex:string>$+$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➖</xml2tex:character>
         <xml2tex:string>$-$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➗</xml2tex:character>
         <xml2tex:string>$\div$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➘</xml2tex:character>
         <xml2tex:string>\ding{216}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➙</xml2tex:character>
         <xml2tex:string>\ding{217}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➚</xml2tex:character>
         <xml2tex:string>\ding{218}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➛</xml2tex:character>
         <xml2tex:string>\ding{219}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➜</xml2tex:character>
         <xml2tex:string>\ding{220}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➝</xml2tex:character>
         <xml2tex:string>\ding{221}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➞</xml2tex:character>
         <xml2tex:string>\ding{222}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➟</xml2tex:character>
         <xml2tex:string>\ding{223}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➠</xml2tex:character>
         <xml2tex:string>\ding{224}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➡</xml2tex:character>
         <xml2tex:string>\ding{225}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➢</xml2tex:character>
         <xml2tex:string>\ding{226}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➣</xml2tex:character>
         <xml2tex:string>\ding{227}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➤</xml2tex:character>
         <xml2tex:string>\ding{228}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➥</xml2tex:character>
         <xml2tex:string>\ding{229}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➦</xml2tex:character>
         <xml2tex:string>\ding{230}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➧</xml2tex:character>
         <xml2tex:string>\ding{231}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➨</xml2tex:character>
         <xml2tex:string>\ding{232}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➩</xml2tex:character>
         <xml2tex:string>\ding{233}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➪</xml2tex:character>
         <xml2tex:string>\ding{234}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➫</xml2tex:character>
         <xml2tex:string>\ding{235}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➬</xml2tex:character>
         <xml2tex:string>\ding{236}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➭</xml2tex:character>
         <xml2tex:string>\ding{237}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➮</xml2tex:character>
         <xml2tex:string>\ding{238}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➯</xml2tex:character>
         <xml2tex:string>\ding{239}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➱</xml2tex:character>
         <xml2tex:string>\ding{241}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➲</xml2tex:character>
         <xml2tex:string>\ding{242}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➳</xml2tex:character>
         <xml2tex:string>\ding{243}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➴</xml2tex:character>
         <xml2tex:string>\ding{244}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➵</xml2tex:character>
         <xml2tex:string>\ding{245}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➶</xml2tex:character>
         <xml2tex:string>\ding{246}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➷</xml2tex:character>
         <xml2tex:string>\ding{247}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➸</xml2tex:character>
         <xml2tex:string>\ding{248}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➹</xml2tex:character>
         <xml2tex:string>\ding{249}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➺</xml2tex:character>
         <xml2tex:string>\ding{250}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➻</xml2tex:character>
         <xml2tex:string>\ding{251}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➼</xml2tex:character>
         <xml2tex:string>\ding{252}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➽</xml2tex:character>
         <xml2tex:string>\ding{253}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>➾</xml2tex:character>
         <xml2tex:string>\ding{254}</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟂</xml2tex:character>
         <xml2tex:string>${\perp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟅</xml2tex:character>
         <xml2tex:string>${\Lbag}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟆</xml2tex:character>
         <xml2tex:string>${\Rbag}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟐</xml2tex:character>
         <xml2tex:string>${\Diamonddot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟜</xml2tex:character>
         <xml2tex:string>${\multimapinv}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟦</xml2tex:character>
         <xml2tex:string>${\llbracket}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟧</xml2tex:character>
         <xml2tex:string>${\rrbracket}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟨</xml2tex:character>
         <xml2tex:string>${\langle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟩</xml2tex:character>
         <xml2tex:string>${\rangle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟪</xml2tex:character>
         <xml2tex:string>${\lang}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟫</xml2tex:character>
         <xml2tex:string>${\rang}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟮</xml2tex:character>
         <xml2tex:string>${\lgroup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟯</xml2tex:character>
         <xml2tex:string>${\rgroup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟵</xml2tex:character>
         <xml2tex:string>${\longleftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟶</xml2tex:character>
         <xml2tex:string>${\longrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟷</xml2tex:character>
         <xml2tex:string>${\longleftrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟸</xml2tex:character>
         <xml2tex:string>${\Longleftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟹</xml2tex:character>
         <xml2tex:string>${\Longrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟺</xml2tex:character>
         <xml2tex:string>${\Longleftrightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟻</xml2tex:character>
         <xml2tex:string>${\longmapsfrom}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟼</xml2tex:character>
         <xml2tex:string>${\longmapsto}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟽</xml2tex:character>
         <xml2tex:string>${\Longmapsfrom}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⟾</xml2tex:character>
         <xml2tex:string>${\Longmapsto}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⤀</xml2tex:character>
         <xml2tex:string>${\psur}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⤆</xml2tex:character>
         <xml2tex:string>${\Mapsfrom}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⤇</xml2tex:character>
         <xml2tex:string>${\Mapsto}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⤒</xml2tex:character>
         <xml2tex:string>${\UpArrowBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⤓</xml2tex:character>
         <xml2tex:string>${\DownArrowBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⤔</xml2tex:character>
         <xml2tex:string>${\pinj}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⤕</xml2tex:character>
         <xml2tex:string>${\finj}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⤖</xml2tex:character>
         <xml2tex:string>${\bij}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⤳</xml2tex:character>
         <xml2tex:string>${\leadsto}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥊</xml2tex:character>
         <xml2tex:string>${\leftrightharpoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥋</xml2tex:character>
         <xml2tex:string>${\rightleftharpoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥎</xml2tex:character>
         <xml2tex:string>${\leftrightharpoonup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥏</xml2tex:character>
         <xml2tex:string>${\rightupdownharpoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥐</xml2tex:character>
         <xml2tex:string>${\leftrightharpoondown}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥑</xml2tex:character>
         <xml2tex:string>${\leftupdownharpoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥒</xml2tex:character>
         <xml2tex:string>${\LeftVectorBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥓</xml2tex:character>
         <xml2tex:string>${\RightVectorBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥔</xml2tex:character>
         <xml2tex:string>${\RightUpVectorBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥕</xml2tex:character>
         <xml2tex:string>${\RightDownVectorBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥖</xml2tex:character>
         <xml2tex:string>${\DownLeftVectorBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥗</xml2tex:character>
         <xml2tex:string>${\DownRightVectorBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥘</xml2tex:character>
         <xml2tex:string>${\LeftUpVectorBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥙</xml2tex:character>
         <xml2tex:string>${\LeftDownVectorBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥚</xml2tex:character>
         <xml2tex:string>${\LeftTeeVector}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥛</xml2tex:character>
         <xml2tex:string>${\RightTeeVector}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥜</xml2tex:character>
         <xml2tex:string>${\RightUpTeeVector}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥝</xml2tex:character>
         <xml2tex:string>${\RightDownTeeVector}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥞</xml2tex:character>
         <xml2tex:string>${\DownLeftTeeVector}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥟</xml2tex:character>
         <xml2tex:string>${\DownRightTeeVector}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥠</xml2tex:character>
         <xml2tex:string>${\LeftUpTeeVector}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥡</xml2tex:character>
         <xml2tex:string>${\LeftDownTeeVector}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥢</xml2tex:character>
         <xml2tex:string>${\leftleftharpoons}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥣</xml2tex:character>
         <xml2tex:string>${\upupharpoons}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥤</xml2tex:character>
         <xml2tex:string>${\rightrightharpoons}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥥</xml2tex:character>
         <xml2tex:string>${\downdownharpoons}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥪</xml2tex:character>
         <xml2tex:string>${\leftbarharpoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥫</xml2tex:character>
         <xml2tex:string>${\barleftharpoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥬</xml2tex:character>
         <xml2tex:string>${\rightbarharpoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥭</xml2tex:character>
         <xml2tex:string>${\barrightharpoon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥮</xml2tex:character>
         <xml2tex:string>${\updownharpoons}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥯</xml2tex:character>
         <xml2tex:string>${\downupharpoons}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥼</xml2tex:character>
         <xml2tex:string>${\strictfi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⥽</xml2tex:character>
         <xml2tex:string>${\strictif}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⦀</xml2tex:character>
         <xml2tex:string>${\VERT}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⦁</xml2tex:character>
         <xml2tex:string>${\spot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⦅</xml2tex:character>
         <xml2tex:string>${\Lparen}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⦆</xml2tex:character>
         <xml2tex:string>${\Rparen}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⦇</xml2tex:character>
         <xml2tex:string>${\limg}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⦈</xml2tex:character>
         <xml2tex:string>${\rimg}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⦉</xml2tex:character>
         <xml2tex:string>${\lblot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⦊</xml2tex:character>
         <xml2tex:string>${\rblot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⦸</xml2tex:character>
         <xml2tex:string>${\circledbslash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧀</xml2tex:character>
         <xml2tex:string>${\circledless}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧁</xml2tex:character>
         <xml2tex:string>${\circledgtr}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧄</xml2tex:character>
         <xml2tex:string>${\boxslash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧅</xml2tex:character>
         <xml2tex:string>${\boxbslash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧆</xml2tex:character>
         <xml2tex:string>${\boxast}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧇</xml2tex:character>
         <xml2tex:string>${\boxcircle}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧈</xml2tex:character>
         <xml2tex:string>${\boxbox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧏</xml2tex:character>
         <xml2tex:string>${\LeftTriangleBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧐</xml2tex:character>
         <xml2tex:string>${\RightTriangleBar}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧟</xml2tex:character>
         <xml2tex:string>${\multimapboth}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧫</xml2tex:character>
         <xml2tex:string>${\blacklozenge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧵</xml2tex:character>
         <xml2tex:string>${\setminus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⧹</xml2tex:character>
         <xml2tex:string>${\zhide}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨀</xml2tex:character>
         <xml2tex:string>${\bigodot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨁</xml2tex:character>
         <xml2tex:string>${\bigoplus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨂</xml2tex:character>
         <xml2tex:string>${\bigotimes}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨄</xml2tex:character>
         <xml2tex:string>${\biguplus}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨅</xml2tex:character>
         <xml2tex:string>${\bigsqcap}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨆</xml2tex:character>
         <xml2tex:string>${\bigsqcup}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨉</xml2tex:character>
         <xml2tex:string>${\varprod}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨌</xml2tex:character>
         <xml2tex:string>${\iiiint}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨏</xml2tex:character>
         <xml2tex:string>${\fint}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨖</xml2tex:character>
         <xml2tex:string>${\sqint}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨝</xml2tex:character>
         <xml2tex:string>${\Join}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨟</xml2tex:character>
         <xml2tex:string>${\zcmp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨠</xml2tex:character>
         <xml2tex:string>${\zpipe}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨡</xml2tex:character>
         <xml2tex:string>${\zproject}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨾</xml2tex:character>
         <xml2tex:string>${\fcmp}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⨿</xml2tex:character>
         <xml2tex:string>${\amalg}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⩞</xml2tex:character>
         <xml2tex:string>${\doublebarwedge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⩤</xml2tex:character>
         <xml2tex:string>${\dsub}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⩥</xml2tex:character>
         <xml2tex:string>${\rsub}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⩴</xml2tex:character>
         <xml2tex:string>${\Coloneqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⩵</xml2tex:character>
         <xml2tex:string>${\Equal}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⩶</xml2tex:character>
         <xml2tex:string>${\Same}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⩽</xml2tex:character>
         <xml2tex:string>${\leqslant}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⩾</xml2tex:character>
         <xml2tex:string>${\geqslant}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪅</xml2tex:character>
         <xml2tex:string>${\lessapprox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪆</xml2tex:character>
         <xml2tex:string>${\gtrapprox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪇</xml2tex:character>
         <xml2tex:string>${\lneq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪈</xml2tex:character>
         <xml2tex:string>${\gneq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪉</xml2tex:character>
         <xml2tex:string>${\lnapprox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪊</xml2tex:character>
         <xml2tex:string>${\gnapprox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪋</xml2tex:character>
         <xml2tex:string>${\lesseqqgtr}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪌</xml2tex:character>
         <xml2tex:string>${\gtreqqless}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪕</xml2tex:character>
         <xml2tex:string>${\eqslantless}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪖</xml2tex:character>
         <xml2tex:string>${\eqslantgtr}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪡</xml2tex:character>
         <xml2tex:string>${\NestedLessLess}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪢</xml2tex:character>
         <xml2tex:string>${\NestedGreaterGreater}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪦</xml2tex:character>
         <xml2tex:string>${\leftslice}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪧</xml2tex:character>
         <xml2tex:string>${\rightslice}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪯</xml2tex:character>
         <xml2tex:string>${\preceq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪰</xml2tex:character>
         <xml2tex:string>${\succeq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪳</xml2tex:character>
         <xml2tex:string>${\preceqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪴</xml2tex:character>
         <xml2tex:string>${\succeqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪷</xml2tex:character>
         <xml2tex:string>${\precapprox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪸</xml2tex:character>
         <xml2tex:string>${\succapprox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪹</xml2tex:character>
         <xml2tex:string>${\precnapprox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪺</xml2tex:character>
         <xml2tex:string>${\succnapprox}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪻</xml2tex:character>
         <xml2tex:string>${\llcurly}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⪼</xml2tex:character>
         <xml2tex:string>${\ggcurly}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫅</xml2tex:character>
         <xml2tex:string>${\subseteqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫆</xml2tex:character>
         <xml2tex:string>${\supseteqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫋</xml2tex:character>
         <xml2tex:string>${\subsetneqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫌</xml2tex:character>
         <xml2tex:string>${\supsetneqq}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫪</xml2tex:character>
         <xml2tex:string>${\Top}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫫</xml2tex:character>
         <xml2tex:string>${\Bot}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫴</xml2tex:character>
         <xml2tex:string>${\interleave}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫼</xml2tex:character>
         <xml2tex:string>${\biginterleave}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫽</xml2tex:character>
         <xml2tex:string>${\sslash}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⫾</xml2tex:character>
         <xml2tex:string>${\talloblong}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⬛</xml2tex:character>
         <xml2tex:string>${\blacksquare}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⬜</xml2tex:character>
         <xml2tex:string>${\square}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⬝</xml2tex:character>
         <xml2tex:string>${\blacksquare}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⬧</xml2tex:character>
         <xml2tex:string>${\blacklozenge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>⬨</xml2tex:character>
         <xml2tex:string>${\lozenge}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>！</xml2tex:character>
         <xml2tex:string>\!</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>＂</xml2tex:character>
         <xml2tex:string>"</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>＃</xml2tex:character>
         <xml2tex:string>\#</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>＄</xml2tex:character>
         <xml2tex:string>\$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>％</xml2tex:character>
         <xml2tex:string>\%</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>＆</xml2tex:character>
         <xml2tex:string>\&amp;</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>＇</xml2tex:character>
         <xml2tex:string>'</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>（</xml2tex:character>
         <xml2tex:string>(</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>）</xml2tex:character>
         <xml2tex:string>)</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>＊</xml2tex:character>
         <xml2tex:string>*</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>＋</xml2tex:character>
         <xml2tex:string>+</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>，</xml2tex:character>
         <xml2tex:string>,</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>－</xml2tex:character>
         <xml2tex:string>-</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>．</xml2tex:character>
         <xml2tex:string>.</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>／</xml2tex:character>
         <xml2tex:string>/</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>�</xml2tex:character>
         <xml2tex:string>${\blacksquare}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐀</xml2tex:character>
         <xml2tex:string>${\mathbf{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐁</xml2tex:character>
         <xml2tex:string>${\mathbf{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐂</xml2tex:character>
         <xml2tex:string>${\mathbf{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐃</xml2tex:character>
         <xml2tex:string>${\mathbf{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐄</xml2tex:character>
         <xml2tex:string>${\mathbf{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐅</xml2tex:character>
         <xml2tex:string>${\mathbf{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐆</xml2tex:character>
         <xml2tex:string>${\mathbf{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐇</xml2tex:character>
         <xml2tex:string>${\mathbf{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐈</xml2tex:character>
         <xml2tex:string>${\mathbf{I}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐉</xml2tex:character>
         <xml2tex:string>${\mathbf{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐊</xml2tex:character>
         <xml2tex:string>${\mathbf{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐋</xml2tex:character>
         <xml2tex:string>${\mathbf{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐌</xml2tex:character>
         <xml2tex:string>${\mathbf{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐍</xml2tex:character>
         <xml2tex:string>${\mathbf{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐎</xml2tex:character>
         <xml2tex:string>${\mathbf{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐏</xml2tex:character>
         <xml2tex:string>${\mathbf{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐐</xml2tex:character>
         <xml2tex:string>${\mathbf{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐑</xml2tex:character>
         <xml2tex:string>${\mathbf{R}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐒</xml2tex:character>
         <xml2tex:string>${\mathbf{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐓</xml2tex:character>
         <xml2tex:string>${\mathbf{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐔</xml2tex:character>
         <xml2tex:string>${\mathbf{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐕</xml2tex:character>
         <xml2tex:string>${\mathbf{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐖</xml2tex:character>
         <xml2tex:string>${\mathbf{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐗</xml2tex:character>
         <xml2tex:string>${\mathbf{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐘</xml2tex:character>
         <xml2tex:string>${\mathbf{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐙</xml2tex:character>
         <xml2tex:string>${\mathbf{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐚</xml2tex:character>
         <xml2tex:string>${\mathbf{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐛</xml2tex:character>
         <xml2tex:string>${\mathbf{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐜</xml2tex:character>
         <xml2tex:string>${\mathbf{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐝</xml2tex:character>
         <xml2tex:string>${\mathbf{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐞</xml2tex:character>
         <xml2tex:string>${\mathbf{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐟</xml2tex:character>
         <xml2tex:string>${\mathbf{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐠</xml2tex:character>
         <xml2tex:string>${\mathbf{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐡</xml2tex:character>
         <xml2tex:string>${\mathbf{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐢</xml2tex:character>
         <xml2tex:string>${\mathbf{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐣</xml2tex:character>
         <xml2tex:string>${\mathbf{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐤</xml2tex:character>
         <xml2tex:string>${\mathbf{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐥</xml2tex:character>
         <xml2tex:string>${\mathbf{l}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐦</xml2tex:character>
         <xml2tex:string>${\mathbf{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐧</xml2tex:character>
         <xml2tex:string>${\mathbf{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐨</xml2tex:character>
         <xml2tex:string>${\mathbf{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐩</xml2tex:character>
         <xml2tex:string>${\mathbf{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐪</xml2tex:character>
         <xml2tex:string>${\mathbf{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐫</xml2tex:character>
         <xml2tex:string>${\mathbf{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐬</xml2tex:character>
         <xml2tex:string>${\mathbf{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐭</xml2tex:character>
         <xml2tex:string>${\mathbf{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐮</xml2tex:character>
         <xml2tex:string>${\mathbf{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐯</xml2tex:character>
         <xml2tex:string>${\mathbf{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐰</xml2tex:character>
         <xml2tex:string>${\mathbf{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐱</xml2tex:character>
         <xml2tex:string>${\mathbf{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐲</xml2tex:character>
         <xml2tex:string>${\mathbf{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐳</xml2tex:character>
         <xml2tex:string>${\mathbf{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐴</xml2tex:character>
         <xml2tex:string>${A}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐵</xml2tex:character>
         <xml2tex:string>${B}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐶</xml2tex:character>
         <xml2tex:string>${C}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐷</xml2tex:character>
         <xml2tex:string>${D}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐸</xml2tex:character>
         <xml2tex:string>${E}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐹</xml2tex:character>
         <xml2tex:string>${F}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐺</xml2tex:character>
         <xml2tex:string>${G}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐻</xml2tex:character>
         <xml2tex:string>${H}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐼</xml2tex:character>
         <xml2tex:string>${I}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐽</xml2tex:character>
         <xml2tex:string>${J}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐾</xml2tex:character>
         <xml2tex:string>${K}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝐿</xml2tex:character>
         <xml2tex:string>${L}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑀</xml2tex:character>
         <xml2tex:string>${M}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑁</xml2tex:character>
         <xml2tex:string>${N}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑂</xml2tex:character>
         <xml2tex:string>${O}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑃</xml2tex:character>
         <xml2tex:string>${P}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑄</xml2tex:character>
         <xml2tex:string>${Q}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑅</xml2tex:character>
         <xml2tex:string>${R}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑆</xml2tex:character>
         <xml2tex:string>${S}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑇</xml2tex:character>
         <xml2tex:string>${T}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑈</xml2tex:character>
         <xml2tex:string>${U}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑉</xml2tex:character>
         <xml2tex:string>${V}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑊</xml2tex:character>
         <xml2tex:string>${W}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑋</xml2tex:character>
         <xml2tex:string>${X}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑌</xml2tex:character>
         <xml2tex:string>${Y}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑍</xml2tex:character>
         <xml2tex:string>${Z}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑎</xml2tex:character>
         <xml2tex:string>${a}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑏</xml2tex:character>
         <xml2tex:string>${b}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑐</xml2tex:character>
         <xml2tex:string>${c}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑑</xml2tex:character>
         <xml2tex:string>${d}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑒</xml2tex:character>
         <xml2tex:string>${e}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑓</xml2tex:character>
         <xml2tex:string>${f}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑔</xml2tex:character>
         <xml2tex:string>${g}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑖</xml2tex:character>
         <xml2tex:string>${i}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑗</xml2tex:character>
         <xml2tex:string>${j}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑘</xml2tex:character>
         <xml2tex:string>${k}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑙</xml2tex:character>
         <xml2tex:string>${l}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑚</xml2tex:character>
         <xml2tex:string>${m}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑛</xml2tex:character>
         <xml2tex:string>${n}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑜</xml2tex:character>
         <xml2tex:string>${o}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑝</xml2tex:character>
         <xml2tex:string>${p}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑞</xml2tex:character>
         <xml2tex:string>${q}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑟</xml2tex:character>
         <xml2tex:string>${r}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑠</xml2tex:character>
         <xml2tex:string>${s}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑡</xml2tex:character>
         <xml2tex:string>${t}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑢</xml2tex:character>
         <xml2tex:string>${u}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑣</xml2tex:character>
         <xml2tex:string>${v}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑤</xml2tex:character>
         <xml2tex:string>${w}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑥</xml2tex:character>
         <xml2tex:string>${x}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑦</xml2tex:character>
         <xml2tex:string>${y}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑧</xml2tex:character>
         <xml2tex:string>${z}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑨</xml2tex:character>
         <xml2tex:string>${\mathbfit{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑩</xml2tex:character>
         <xml2tex:string>${\mathbfit{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑪</xml2tex:character>
         <xml2tex:string>${\mathbfit{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑫</xml2tex:character>
         <xml2tex:string>${\mathbfit{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑬</xml2tex:character>
         <xml2tex:string>${\mathbfit{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑭</xml2tex:character>
         <xml2tex:string>${\mathbfit{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑮</xml2tex:character>
         <xml2tex:string>${\mathbfit{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑯</xml2tex:character>
         <xml2tex:string>${\mathbfit{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑰</xml2tex:character>
         <xml2tex:string>${\mathbfit{I}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑱</xml2tex:character>
         <xml2tex:string>${\mathbfit{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑲</xml2tex:character>
         <xml2tex:string>${\mathbfit{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑳</xml2tex:character>
         <xml2tex:string>${\mathbfit{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑴</xml2tex:character>
         <xml2tex:string>${\mathbfit{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑵</xml2tex:character>
         <xml2tex:string>${\mathbfit{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑶</xml2tex:character>
         <xml2tex:string>${\mathbfit{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑷</xml2tex:character>
         <xml2tex:string>${\mathbfit{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑸</xml2tex:character>
         <xml2tex:string>${\mathbfit{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑹</xml2tex:character>
         <xml2tex:string>${\mathbfit{R}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑺</xml2tex:character>
         <xml2tex:string>${\mathbfit{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑻</xml2tex:character>
         <xml2tex:string>${\mathbfit{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑼</xml2tex:character>
         <xml2tex:string>${\mathbfit{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑽</xml2tex:character>
         <xml2tex:string>${\mathbfit{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑾</xml2tex:character>
         <xml2tex:string>${\mathbfit{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝑿</xml2tex:character>
         <xml2tex:string>${\mathbfit{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒀</xml2tex:character>
         <xml2tex:string>${\mathbfit{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒁</xml2tex:character>
         <xml2tex:string>${\mathbfit{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒂</xml2tex:character>
         <xml2tex:string>${\mathbfit{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒃</xml2tex:character>
         <xml2tex:string>${\mathbfit{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒄</xml2tex:character>
         <xml2tex:string>${\mathbfit{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒅</xml2tex:character>
         <xml2tex:string>${\mathbfit{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒆</xml2tex:character>
         <xml2tex:string>${\mathbfit{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒇</xml2tex:character>
         <xml2tex:string>${\mathbfit{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒈</xml2tex:character>
         <xml2tex:string>${\mathbfit{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒉</xml2tex:character>
         <xml2tex:string>${\mathbfit{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒊</xml2tex:character>
         <xml2tex:string>${\mathbfit{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒋</xml2tex:character>
         <xml2tex:string>${\mathbfit{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒌</xml2tex:character>
         <xml2tex:string>${\mathbfit{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒍</xml2tex:character>
         <xml2tex:string>${\mathbfit{l}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒎</xml2tex:character>
         <xml2tex:string>${\mathbfit{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒏</xml2tex:character>
         <xml2tex:string>${\mathbfit{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒐</xml2tex:character>
         <xml2tex:string>${\mathbfit{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒑</xml2tex:character>
         <xml2tex:string>${\mathbfit{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒒</xml2tex:character>
         <xml2tex:string>${\mathbfit{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒓</xml2tex:character>
         <xml2tex:string>${\mathbfit{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒔</xml2tex:character>
         <xml2tex:string>${\mathbfit{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒕</xml2tex:character>
         <xml2tex:string>${\mathbfit{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒖</xml2tex:character>
         <xml2tex:string>${\mathbfit{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒗</xml2tex:character>
         <xml2tex:string>${\mathbfit{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒘</xml2tex:character>
         <xml2tex:string>${\mathbfit{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒙</xml2tex:character>
         <xml2tex:string>${\mathbfit{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒚</xml2tex:character>
         <xml2tex:string>${\mathbfit{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒛</xml2tex:character>
         <xml2tex:string>${\mathbfit{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒜</xml2tex:character>
         <xml2tex:string>${\mathcal{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒞</xml2tex:character>
         <xml2tex:string>${\mathcal{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒟</xml2tex:character>
         <xml2tex:string>${\mathcal{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒢</xml2tex:character>
         <xml2tex:string>${\mathcal{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒥</xml2tex:character>
         <xml2tex:string>${\mathcal{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒦</xml2tex:character>
         <xml2tex:string>${\mathcal{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒩</xml2tex:character>
         <xml2tex:string>${\mathcal{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒪</xml2tex:character>
         <xml2tex:string>${\mathcal{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒫</xml2tex:character>
         <xml2tex:string>${\mathcal{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒬</xml2tex:character>
         <xml2tex:string>${\mathcal{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒮</xml2tex:character>
         <xml2tex:string>${\mathcal{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒯</xml2tex:character>
         <xml2tex:string>${\mathcal{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒰</xml2tex:character>
         <xml2tex:string>${\mathcal{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒱</xml2tex:character>
         <xml2tex:string>${\mathcal{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒲</xml2tex:character>
         <xml2tex:string>${\mathcal{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒳</xml2tex:character>
         <xml2tex:string>${\mathcal{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒴</xml2tex:character>
         <xml2tex:string>${\mathcal{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒵</xml2tex:character>
         <xml2tex:string>${\mathcal{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒶</xml2tex:character>
         <xml2tex:string>${\mathcal{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒷</xml2tex:character>
         <xml2tex:string>${\mathcal{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒸</xml2tex:character>
         <xml2tex:string>${\mathcal{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒹</xml2tex:character>
         <xml2tex:string>${\mathcal{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒻</xml2tex:character>
         <xml2tex:string>${\mathcal{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒽</xml2tex:character>
         <xml2tex:string>${\mathcal{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒾</xml2tex:character>
         <xml2tex:string>${\mathcal{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝒿</xml2tex:character>
         <xml2tex:string>${\mathcal{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓀</xml2tex:character>
         <xml2tex:string>${\mathcal{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓁</xml2tex:character>
         <xml2tex:string>${\ell}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓂</xml2tex:character>
         <xml2tex:string>${\mathcal{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓃</xml2tex:character>
         <xml2tex:string>${\mathcal{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓅</xml2tex:character>
         <xml2tex:string>${\mathcal{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓆</xml2tex:character>
         <xml2tex:string>${\mathcal{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓇</xml2tex:character>
         <xml2tex:string>${\mathcal{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓈</xml2tex:character>
         <xml2tex:string>${\mathcal{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓉</xml2tex:character>
         <xml2tex:string>${\mathcal{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓊</xml2tex:character>
         <xml2tex:string>${\mathcal{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓋</xml2tex:character>
         <xml2tex:string>${\mathcal{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓌</xml2tex:character>
         <xml2tex:string>${\mathcal{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓍</xml2tex:character>
         <xml2tex:string>${\mathcal{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓎</xml2tex:character>
         <xml2tex:string>${\mathcal{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝓏</xml2tex:character>
         <xml2tex:string>${\mathcal{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔄</xml2tex:character>
         <xml2tex:string>${\mathfrak{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔅</xml2tex:character>
         <xml2tex:string>${\mathfrak{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔇</xml2tex:character>
         <xml2tex:string>${\mathfrak{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔈</xml2tex:character>
         <xml2tex:string>${\mathfrak{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔉</xml2tex:character>
         <xml2tex:string>${\mathfrak{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔊</xml2tex:character>
         <xml2tex:string>${\mathfrak{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔍</xml2tex:character>
         <xml2tex:string>${\mathfrak{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔎</xml2tex:character>
         <xml2tex:string>${\mathfrak{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔏</xml2tex:character>
         <xml2tex:string>${\mathfrak{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔐</xml2tex:character>
         <xml2tex:string>${\mathfrak{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔑</xml2tex:character>
         <xml2tex:string>${\mathfrak{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔒</xml2tex:character>
         <xml2tex:string>${\mathfrak{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔓</xml2tex:character>
         <xml2tex:string>${\mathfrak{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔔</xml2tex:character>
         <xml2tex:string>${\mathfrak{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔖</xml2tex:character>
         <xml2tex:string>${\mathfrak{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔗</xml2tex:character>
         <xml2tex:string>${\mathfrak{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔘</xml2tex:character>
         <xml2tex:string>${\mathfrak{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔙</xml2tex:character>
         <xml2tex:string>${\mathfrak{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔚</xml2tex:character>
         <xml2tex:string>${\mathfrak{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔛</xml2tex:character>
         <xml2tex:string>${\mathfrak{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔜</xml2tex:character>
         <xml2tex:string>${\mathfrak{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔞</xml2tex:character>
         <xml2tex:string>${\mathfrak{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔟</xml2tex:character>
         <xml2tex:string>${\mathfrak{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔠</xml2tex:character>
         <xml2tex:string>${\mathfrak{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔡</xml2tex:character>
         <xml2tex:string>${\mathfrak{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔢</xml2tex:character>
         <xml2tex:string>${\mathfrak{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔣</xml2tex:character>
         <xml2tex:string>${\mathfrak{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔤</xml2tex:character>
         <xml2tex:string>${\mathfrak{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔥</xml2tex:character>
         <xml2tex:string>${\mathfrak{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔦</xml2tex:character>
         <xml2tex:string>${\mathfrak{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔧</xml2tex:character>
         <xml2tex:string>${\mathfrak{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔨</xml2tex:character>
         <xml2tex:string>${\mathfrak{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔩</xml2tex:character>
         <xml2tex:string>${\mathfrak{l}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔪</xml2tex:character>
         <xml2tex:string>${\mathfrak{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔫</xml2tex:character>
         <xml2tex:string>${\mathfrak{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔬</xml2tex:character>
         <xml2tex:string>${\mathfrak{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔭</xml2tex:character>
         <xml2tex:string>${\mathfrak{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔮</xml2tex:character>
         <xml2tex:string>${\mathfrak{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔯</xml2tex:character>
         <xml2tex:string>${\mathfrak{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔰</xml2tex:character>
         <xml2tex:string>${\mathfrak{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔱</xml2tex:character>
         <xml2tex:string>${\mathfrak{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔲</xml2tex:character>
         <xml2tex:string>${\mathfrak{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔳</xml2tex:character>
         <xml2tex:string>${\mathfrak{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔴</xml2tex:character>
         <xml2tex:string>${\mathfrak{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔵</xml2tex:character>
         <xml2tex:string>${\mathfrak{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔶</xml2tex:character>
         <xml2tex:string>${\mathfrak{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔷</xml2tex:character>
         <xml2tex:string>${\mathfrak{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔸</xml2tex:character>
         <xml2tex:string>${\mathbb{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔹</xml2tex:character>
         <xml2tex:string>${\mathbb{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔻</xml2tex:character>
         <xml2tex:string>${\mathbb{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔼</xml2tex:character>
         <xml2tex:string>${\mathbb{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔽</xml2tex:character>
         <xml2tex:string>${\mathbb{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝔾</xml2tex:character>
         <xml2tex:string>${\mathbb{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕀</xml2tex:character>
         <xml2tex:string>${\mathbb{I}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕁</xml2tex:character>
         <xml2tex:string>${\mathbb{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕂</xml2tex:character>
         <xml2tex:string>${\mathbb{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕃</xml2tex:character>
         <xml2tex:string>${\mathbb{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕄</xml2tex:character>
         <xml2tex:string>${\mathbb{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕆</xml2tex:character>
         <xml2tex:string>${\mathbb{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕊</xml2tex:character>
         <xml2tex:string>${\mathbb{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕋</xml2tex:character>
         <xml2tex:string>${\mathbb{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕌</xml2tex:character>
         <xml2tex:string>${\mathbb{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕍</xml2tex:character>
         <xml2tex:string>${\mathbb{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕎</xml2tex:character>
         <xml2tex:string>${\mathbb{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕏</xml2tex:character>
         <xml2tex:string>${\mathbb{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕐</xml2tex:character>
         <xml2tex:string>${\mathbb{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕒</xml2tex:character>
         <xml2tex:string>${\mathbb{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕓</xml2tex:character>
         <xml2tex:string>${\mathbb{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕔</xml2tex:character>
         <xml2tex:string>${\mathbb{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕕</xml2tex:character>
         <xml2tex:string>${\mathbb{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕖</xml2tex:character>
         <xml2tex:string>${\mathbb{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕗</xml2tex:character>
         <xml2tex:string>${\mathbb{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕘</xml2tex:character>
         <xml2tex:string>${\mathbb{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕙</xml2tex:character>
         <xml2tex:string>${\mathbb{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕚</xml2tex:character>
         <xml2tex:string>${\mathbb{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕛</xml2tex:character>
         <xml2tex:string>${\mathbb{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕜</xml2tex:character>
         <xml2tex:string>${\mathbb{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕝</xml2tex:character>
         <xml2tex:string>${\mathbb{l}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕞</xml2tex:character>
         <xml2tex:string>${\mathbb{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕟</xml2tex:character>
         <xml2tex:string>${\mathbb{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕠</xml2tex:character>
         <xml2tex:string>${\mathbb{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕡</xml2tex:character>
         <xml2tex:string>${\mathbb{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕢</xml2tex:character>
         <xml2tex:string>${\mathbb{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕣</xml2tex:character>
         <xml2tex:string>${\mathbb{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕤</xml2tex:character>
         <xml2tex:string>${\mathbb{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕥</xml2tex:character>
         <xml2tex:string>${\mathbb{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕦</xml2tex:character>
         <xml2tex:string>${\mathbb{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕧</xml2tex:character>
         <xml2tex:string>${\mathbb{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕨</xml2tex:character>
         <xml2tex:string>${\mathbb{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕩</xml2tex:character>
         <xml2tex:string>${\mathbb{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕪</xml2tex:character>
         <xml2tex:string>${\mathbb{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝕫</xml2tex:character>
         <xml2tex:string>${\mathbb{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖠</xml2tex:character>
         <xml2tex:string>${\mathsf{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖡</xml2tex:character>
         <xml2tex:string>${\mathsf{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖢</xml2tex:character>
         <xml2tex:string>${\mathsf{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖣</xml2tex:character>
         <xml2tex:string>${\mathsf{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖤</xml2tex:character>
         <xml2tex:string>${\mathsf{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖥</xml2tex:character>
         <xml2tex:string>${\mathsf{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖦</xml2tex:character>
         <xml2tex:string>${\mathsf{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖧</xml2tex:character>
         <xml2tex:string>${\mathsf{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖨</xml2tex:character>
         <xml2tex:string>${\mathsf{I}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖩</xml2tex:character>
         <xml2tex:string>${\mathsf{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖪</xml2tex:character>
         <xml2tex:string>${\mathsf{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖫</xml2tex:character>
         <xml2tex:string>${\mathsf{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖬</xml2tex:character>
         <xml2tex:string>${\mathsf{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖭</xml2tex:character>
         <xml2tex:string>${\mathsf{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖮</xml2tex:character>
         <xml2tex:string>${\mathsf{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖯</xml2tex:character>
         <xml2tex:string>${\mathsf{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖰</xml2tex:character>
         <xml2tex:string>${\mathsf{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖱</xml2tex:character>
         <xml2tex:string>${\mathsf{R}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖲</xml2tex:character>
         <xml2tex:string>${\mathsf{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖳</xml2tex:character>
         <xml2tex:string>${\mathsf{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖴</xml2tex:character>
         <xml2tex:string>${\mathsf{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖵</xml2tex:character>
         <xml2tex:string>${\mathsf{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖶</xml2tex:character>
         <xml2tex:string>${\mathsf{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖷</xml2tex:character>
         <xml2tex:string>${\mathsf{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖸</xml2tex:character>
         <xml2tex:string>${\mathsf{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖹</xml2tex:character>
         <xml2tex:string>${\mathsf{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖺</xml2tex:character>
         <xml2tex:string>${\mathsf{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖻</xml2tex:character>
         <xml2tex:string>${\mathsf{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖼</xml2tex:character>
         <xml2tex:string>${\mathsf{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖽</xml2tex:character>
         <xml2tex:string>${\mathsf{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖾</xml2tex:character>
         <xml2tex:string>${\mathsf{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝖿</xml2tex:character>
         <xml2tex:string>${\mathsf{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗀</xml2tex:character>
         <xml2tex:string>${\mathsf{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗁</xml2tex:character>
         <xml2tex:string>${\mathsf{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗂</xml2tex:character>
         <xml2tex:string>${\mathsf{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗃</xml2tex:character>
         <xml2tex:string>${\mathsf{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗄</xml2tex:character>
         <xml2tex:string>${\mathsf{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗅</xml2tex:character>
         <xml2tex:string>${\mathsf{l}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗆</xml2tex:character>
         <xml2tex:string>${\mathsf{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗇</xml2tex:character>
         <xml2tex:string>${\mathsf{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗈</xml2tex:character>
         <xml2tex:string>${\mathsf{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗉</xml2tex:character>
         <xml2tex:string>${\mathsf{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗊</xml2tex:character>
         <xml2tex:string>${\mathsf{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗋</xml2tex:character>
         <xml2tex:string>${\mathsf{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗌</xml2tex:character>
         <xml2tex:string>${\mathsf{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗍</xml2tex:character>
         <xml2tex:string>${\mathsf{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗎</xml2tex:character>
         <xml2tex:string>${\mathsf{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗏</xml2tex:character>
         <xml2tex:string>${\mathsf{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗐</xml2tex:character>
         <xml2tex:string>${\mathsf{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗑</xml2tex:character>
         <xml2tex:string>${\mathsf{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗒</xml2tex:character>
         <xml2tex:string>${\mathsf{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗓</xml2tex:character>
         <xml2tex:string>${\mathsf{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗔</xml2tex:character>
         <xml2tex:string>${\mathsfbf{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗕</xml2tex:character>
         <xml2tex:string>${\mathsfbf{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗖</xml2tex:character>
         <xml2tex:string>${\mathsfbf{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗗</xml2tex:character>
         <xml2tex:string>${\mathsfbf{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗘</xml2tex:character>
         <xml2tex:string>${\mathsfbf{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗙</xml2tex:character>
         <xml2tex:string>${\mathsfbf{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗚</xml2tex:character>
         <xml2tex:string>${\mathsfbf{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗛</xml2tex:character>
         <xml2tex:string>${\mathsfbf{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗜</xml2tex:character>
         <xml2tex:string>${\mathsfbf{I}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗝</xml2tex:character>
         <xml2tex:string>${\mathsfbf{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗞</xml2tex:character>
         <xml2tex:string>${\mathsfbf{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗟</xml2tex:character>
         <xml2tex:string>${\mathsfbf{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗠</xml2tex:character>
         <xml2tex:string>${\mathsfbf{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗡</xml2tex:character>
         <xml2tex:string>${\mathsfbf{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗢</xml2tex:character>
         <xml2tex:string>${\mathsfbf{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗣</xml2tex:character>
         <xml2tex:string>${\mathsfbf{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗤</xml2tex:character>
         <xml2tex:string>${\mathsfbf{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗥</xml2tex:character>
         <xml2tex:string>${\mathsfbf{R}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗦</xml2tex:character>
         <xml2tex:string>${\mathsfbf{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗧</xml2tex:character>
         <xml2tex:string>${\mathsfbf{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗨</xml2tex:character>
         <xml2tex:string>${\mathsfbf{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗩</xml2tex:character>
         <xml2tex:string>${\mathsfbf{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗪</xml2tex:character>
         <xml2tex:string>${\mathsfbf{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗫</xml2tex:character>
         <xml2tex:string>${\mathsfbf{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗬</xml2tex:character>
         <xml2tex:string>${\mathsfbf{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗭</xml2tex:character>
         <xml2tex:string>${\mathsfbf{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗮</xml2tex:character>
         <xml2tex:string>${\mathsfbf{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗯</xml2tex:character>
         <xml2tex:string>${\mathsfbf{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗰</xml2tex:character>
         <xml2tex:string>${\mathsfbf{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗱</xml2tex:character>
         <xml2tex:string>${\mathsfbf{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗲</xml2tex:character>
         <xml2tex:string>${\mathsfbf{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗳</xml2tex:character>
         <xml2tex:string>${\mathsfbf{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗴</xml2tex:character>
         <xml2tex:string>${\mathsfbf{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗵</xml2tex:character>
         <xml2tex:string>${\mathsfbf{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗶</xml2tex:character>
         <xml2tex:string>${\mathsfbf{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗷</xml2tex:character>
         <xml2tex:string>${\mathsfbf{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗸</xml2tex:character>
         <xml2tex:string>${\mathsfbf{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗹</xml2tex:character>
         <xml2tex:string>${\mathsfbf{l}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗺</xml2tex:character>
         <xml2tex:string>${\mathsfbf{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗻</xml2tex:character>
         <xml2tex:string>${\mathsfbf{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗼</xml2tex:character>
         <xml2tex:string>${\mathsfbf{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗽</xml2tex:character>
         <xml2tex:string>${\mathsfbf{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗾</xml2tex:character>
         <xml2tex:string>${\mathsfbf{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝗿</xml2tex:character>
         <xml2tex:string>${\mathsfbf{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘀</xml2tex:character>
         <xml2tex:string>${\mathsfbf{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘁</xml2tex:character>
         <xml2tex:string>${\mathsfbf{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘂</xml2tex:character>
         <xml2tex:string>${\mathsfbf{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘃</xml2tex:character>
         <xml2tex:string>${\mathsfbf{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘄</xml2tex:character>
         <xml2tex:string>${\mathsfbf{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘅</xml2tex:character>
         <xml2tex:string>${\mathsfbf{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘆</xml2tex:character>
         <xml2tex:string>${\mathsfbf{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘇</xml2tex:character>
         <xml2tex:string>${\mathsfbf{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘈</xml2tex:character>
         <xml2tex:string>${\mathsfit{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘉</xml2tex:character>
         <xml2tex:string>${\mathsfit{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘊</xml2tex:character>
         <xml2tex:string>${\mathsfit{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘋</xml2tex:character>
         <xml2tex:string>${\mathsfit{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘌</xml2tex:character>
         <xml2tex:string>${\mathsfit{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘍</xml2tex:character>
         <xml2tex:string>${\mathsfit{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘎</xml2tex:character>
         <xml2tex:string>${\mathsfit{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘏</xml2tex:character>
         <xml2tex:string>${\mathsfit{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘐</xml2tex:character>
         <xml2tex:string>${\mathsfit{I}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘑</xml2tex:character>
         <xml2tex:string>${\mathsfit{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘒</xml2tex:character>
         <xml2tex:string>${\mathsfit{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘓</xml2tex:character>
         <xml2tex:string>${\mathsfit{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘔</xml2tex:character>
         <xml2tex:string>${\mathsfit{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘕</xml2tex:character>
         <xml2tex:string>${\mathsfit{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘖</xml2tex:character>
         <xml2tex:string>${\mathsfit{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘗</xml2tex:character>
         <xml2tex:string>${\mathsfit{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘘</xml2tex:character>
         <xml2tex:string>${\mathsfit{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘙</xml2tex:character>
         <xml2tex:string>${\mathsfit{R}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘚</xml2tex:character>
         <xml2tex:string>${\mathsfit{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘛</xml2tex:character>
         <xml2tex:string>${\mathsfit{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘜</xml2tex:character>
         <xml2tex:string>${\mathsfit{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘝</xml2tex:character>
         <xml2tex:string>${\mathsfit{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘞</xml2tex:character>
         <xml2tex:string>${\mathsfit{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘟</xml2tex:character>
         <xml2tex:string>${\mathsfit{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘠</xml2tex:character>
         <xml2tex:string>${\mathsfit{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘡</xml2tex:character>
         <xml2tex:string>${\mathsfit{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘢</xml2tex:character>
         <xml2tex:string>${\mathsfit{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘣</xml2tex:character>
         <xml2tex:string>${\mathsfit{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘤</xml2tex:character>
         <xml2tex:string>${\mathsfit{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘥</xml2tex:character>
         <xml2tex:string>${\mathsfit{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘦</xml2tex:character>
         <xml2tex:string>${\mathsfit{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘧</xml2tex:character>
         <xml2tex:string>${\mathsfit{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘨</xml2tex:character>
         <xml2tex:string>${\mathsfit{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘩</xml2tex:character>
         <xml2tex:string>${\mathsfit{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘪</xml2tex:character>
         <xml2tex:string>${\mathsfit{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘫</xml2tex:character>
         <xml2tex:string>${\mathsfit{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘬</xml2tex:character>
         <xml2tex:string>${\mathsfit{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘭</xml2tex:character>
         <xml2tex:string>${\mathsfit{l}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘮</xml2tex:character>
         <xml2tex:string>${\mathsfit{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘯</xml2tex:character>
         <xml2tex:string>${\mathsfit{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘰</xml2tex:character>
         <xml2tex:string>${\mathsfit{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘱</xml2tex:character>
         <xml2tex:string>${\mathsfit{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘲</xml2tex:character>
         <xml2tex:string>${\mathsfit{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘳</xml2tex:character>
         <xml2tex:string>${\mathsfit{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘴</xml2tex:character>
         <xml2tex:string>${\mathsfit{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘵</xml2tex:character>
         <xml2tex:string>${\mathsfit{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘶</xml2tex:character>
         <xml2tex:string>${\mathsfit{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘷</xml2tex:character>
         <xml2tex:string>${\mathsfit{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘸</xml2tex:character>
         <xml2tex:string>${\mathsfit{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘹</xml2tex:character>
         <xml2tex:string>${\mathsfit{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘺</xml2tex:character>
         <xml2tex:string>${\mathsfit{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘻</xml2tex:character>
         <xml2tex:string>${\mathsfit{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘼</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘽</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘾</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝘿</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙀</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙁</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙂</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙃</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙄</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{I}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙅</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙆</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙇</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙈</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙉</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙊</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙋</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙌</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙍</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{R}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙎</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙏</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙐</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙑</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙒</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙓</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙔</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙕</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙖</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙗</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙘</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙙</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙚</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙛</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙜</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙝</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙞</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙟</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙠</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙡</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{l}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙢</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙣</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙤</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙥</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙦</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙧</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙨</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙩</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙪</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙫</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙬</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙭</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙮</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙯</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙰</xml2tex:character>
         <xml2tex:string>${\mathtt{A}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙱</xml2tex:character>
         <xml2tex:string>${\mathtt{B}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙲</xml2tex:character>
         <xml2tex:string>${\mathtt{C}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙳</xml2tex:character>
         <xml2tex:string>${\mathtt{D}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙴</xml2tex:character>
         <xml2tex:string>${\mathtt{E}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙵</xml2tex:character>
         <xml2tex:string>${\mathtt{F}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙶</xml2tex:character>
         <xml2tex:string>${\mathtt{G}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙷</xml2tex:character>
         <xml2tex:string>${\mathtt{H}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙸</xml2tex:character>
         <xml2tex:string>${\mathtt{I}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙹</xml2tex:character>
         <xml2tex:string>${\mathtt{J}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙺</xml2tex:character>
         <xml2tex:string>${\mathtt{K}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙻</xml2tex:character>
         <xml2tex:string>${\mathtt{L}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙼</xml2tex:character>
         <xml2tex:string>${\mathtt{M}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙽</xml2tex:character>
         <xml2tex:string>${\mathtt{N}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙾</xml2tex:character>
         <xml2tex:string>${\mathtt{O}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝙿</xml2tex:character>
         <xml2tex:string>${\mathtt{P}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚀</xml2tex:character>
         <xml2tex:string>${\mathtt{Q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚁</xml2tex:character>
         <xml2tex:string>${\mathtt{R}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚂</xml2tex:character>
         <xml2tex:string>${\mathtt{S}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚃</xml2tex:character>
         <xml2tex:string>${\mathtt{T}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚄</xml2tex:character>
         <xml2tex:string>${\mathtt{U}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚅</xml2tex:character>
         <xml2tex:string>${\mathtt{V}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚆</xml2tex:character>
         <xml2tex:string>${\mathtt{W}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚇</xml2tex:character>
         <xml2tex:string>${\mathtt{X}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚈</xml2tex:character>
         <xml2tex:string>${\mathtt{Y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚉</xml2tex:character>
         <xml2tex:string>${\mathtt{Z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚊</xml2tex:character>
         <xml2tex:string>${\mathtt{a}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚋</xml2tex:character>
         <xml2tex:string>${\mathtt{b}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚌</xml2tex:character>
         <xml2tex:string>${\mathtt{c}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚍</xml2tex:character>
         <xml2tex:string>${\mathtt{d}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚎</xml2tex:character>
         <xml2tex:string>${\mathtt{e}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚏</xml2tex:character>
         <xml2tex:string>${\mathtt{f}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚐</xml2tex:character>
         <xml2tex:string>${\mathtt{g}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚑</xml2tex:character>
         <xml2tex:string>${\mathtt{h}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚒</xml2tex:character>
         <xml2tex:string>${\mathtt{i}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚓</xml2tex:character>
         <xml2tex:string>${\mathtt{j}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚔</xml2tex:character>
         <xml2tex:string>${\mathtt{k}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚕</xml2tex:character>
         <xml2tex:string>${\mathtt{l}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚖</xml2tex:character>
         <xml2tex:string>${\mathtt{m}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚗</xml2tex:character>
         <xml2tex:string>${\mathtt{n}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚘</xml2tex:character>
         <xml2tex:string>${\mathtt{o}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚙</xml2tex:character>
         <xml2tex:string>${\mathtt{p}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚚</xml2tex:character>
         <xml2tex:string>${\mathtt{q}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚛</xml2tex:character>
         <xml2tex:string>${\mathtt{r}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚜</xml2tex:character>
         <xml2tex:string>${\mathtt{s}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚝</xml2tex:character>
         <xml2tex:string>${\mathtt{t}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚞</xml2tex:character>
         <xml2tex:string>${\mathtt{u}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚟</xml2tex:character>
         <xml2tex:string>${\mathtt{v}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚠</xml2tex:character>
         <xml2tex:string>${\mathtt{w}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚡</xml2tex:character>
         <xml2tex:string>${\mathtt{x}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚢</xml2tex:character>
         <xml2tex:string>${\mathtt{y}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚣</xml2tex:character>
         <xml2tex:string>${\mathtt{z}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚤</xml2tex:character>
         <xml2tex:string>${\imath}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚥</xml2tex:character>
         <xml2tex:string>${\jmath}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚪</xml2tex:character>
         <xml2tex:string>${\mathbf{\Gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚫</xml2tex:character>
         <xml2tex:string>${\mathbf{\Delta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚯</xml2tex:character>
         <xml2tex:string>${\mathbf{\Theta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚲</xml2tex:character>
         <xml2tex:string>${\mathbf{\Lambda}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚵</xml2tex:character>
         <xml2tex:string>${\mathbf{\Xi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚷</xml2tex:character>
         <xml2tex:string>${\mathbf{\Pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚺</xml2tex:character>
         <xml2tex:string>${\mathbf{\Sigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚼</xml2tex:character>
         <xml2tex:string>${\mathbf{\Upsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚽</xml2tex:character>
         <xml2tex:string>${\mathbf{\Phi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝚿</xml2tex:character>
         <xml2tex:string>${\mathbf{\Psi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛀</xml2tex:character>
         <xml2tex:string>${\mathbf{\Omega}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛂</xml2tex:character>
         <xml2tex:string>${\mathbf{\alpha}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛃</xml2tex:character>
         <xml2tex:string>${\mathbf{\beta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛄</xml2tex:character>
         <xml2tex:string>${\mathbf{\gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛅</xml2tex:character>
         <xml2tex:string>${\mathbf{\delta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛆</xml2tex:character>
         <xml2tex:string>${\mathbf{\varepsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛇</xml2tex:character>
         <xml2tex:string>${\mathbf{\zeta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛈</xml2tex:character>
         <xml2tex:string>${\mathbf{\eta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛉</xml2tex:character>
         <xml2tex:string>${\mathbf{\theta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛊</xml2tex:character>
         <xml2tex:string>${\mathbf{\iota}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛋</xml2tex:character>
         <xml2tex:string>${\mathbf{\kappa}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛌</xml2tex:character>
         <xml2tex:string>${\mathbf{\lambda}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛍</xml2tex:character>
         <xml2tex:string>${\mathbf{\mu}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛎</xml2tex:character>
         <xml2tex:string>${\mathbf{\nu}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛏</xml2tex:character>
         <xml2tex:string>${\mathbf{\xi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛑</xml2tex:character>
         <xml2tex:string>${\mathbf{\pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛒</xml2tex:character>
         <xml2tex:string>${\mathbf{\rho}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛓</xml2tex:character>
         <xml2tex:string>${\mathbf{\varsigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛔</xml2tex:character>
         <xml2tex:string>${\mathbf{\sigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛕</xml2tex:character>
         <xml2tex:string>${\mathbf{\tau}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛖</xml2tex:character>
         <xml2tex:string>${\mathbf{\upsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛗</xml2tex:character>
         <xml2tex:string>${\mathbf{\varphi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛘</xml2tex:character>
         <xml2tex:string>${\mathbf{\chi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛙</xml2tex:character>
         <xml2tex:string>${\mathbf{\psi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛚</xml2tex:character>
         <xml2tex:string>${\mathbf{\omega}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛜</xml2tex:character>
         <xml2tex:string>${\mathbf{\epsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛝</xml2tex:character>
         <xml2tex:string>${\mathbf{\vartheta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛟</xml2tex:character>
         <xml2tex:string>${\mathbf{\phi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛠</xml2tex:character>
         <xml2tex:string>${\mathbf{\varrho}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛡</xml2tex:character>
         <xml2tex:string>${\mathbf{\varpi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛤</xml2tex:character>
         <xml2tex:string>${\Gamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛥</xml2tex:character>
         <xml2tex:string>${\Delta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛩</xml2tex:character>
         <xml2tex:string>${\Theta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛬</xml2tex:character>
         <xml2tex:string>${\Lambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛯</xml2tex:character>
         <xml2tex:string>${\Xi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛱</xml2tex:character>
         <xml2tex:string>${\Pi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛴</xml2tex:character>
         <xml2tex:string>${\Sigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛶</xml2tex:character>
         <xml2tex:string>${\Upsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛷</xml2tex:character>
         <xml2tex:string>${\Phi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛹</xml2tex:character>
         <xml2tex:string>${\Psi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛺</xml2tex:character>
         <xml2tex:string>${\Omega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛼</xml2tex:character>
         <xml2tex:string>${\alpha}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛽</xml2tex:character>
         <xml2tex:string>${\beta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛾</xml2tex:character>
         <xml2tex:string>${\gamma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝛿</xml2tex:character>
         <xml2tex:string>${\delta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜀</xml2tex:character>
         <xml2tex:string>${\upvarepsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜁</xml2tex:character>
         <xml2tex:string>${\zeta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜂</xml2tex:character>
         <xml2tex:string>${\eta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜃</xml2tex:character>
         <xml2tex:string>${\theta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜄</xml2tex:character>
         <xml2tex:string>${\iota}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜅</xml2tex:character>
         <xml2tex:string>${\kappa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜆</xml2tex:character>
         <xml2tex:string>${\lambda}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜇</xml2tex:character>
         <xml2tex:string>${\mu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜈</xml2tex:character>
         <xml2tex:string>${\nu}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜉</xml2tex:character>
         <xml2tex:string>${\xi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜋</xml2tex:character>
         <xml2tex:string>${\pi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜌</xml2tex:character>
         <xml2tex:string>${\rho}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜍</xml2tex:character>
         <xml2tex:string>${\varsigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜎</xml2tex:character>
         <xml2tex:string>${\sigma}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜏</xml2tex:character>
         <xml2tex:string>${\tau}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜐</xml2tex:character>
         <xml2tex:string>${\upsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜑</xml2tex:character>
         <xml2tex:string>${\varphi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜒</xml2tex:character>
         <xml2tex:string>${\chi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜓</xml2tex:character>
         <xml2tex:string>${\psi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜔</xml2tex:character>
         <xml2tex:string>${\omega}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜕</xml2tex:character>
         <xml2tex:string>${\partial}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜖</xml2tex:character>
         <xml2tex:string>${\epsilon}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜗</xml2tex:character>
         <xml2tex:string>${\vartheta}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜘</xml2tex:character>
         <xml2tex:string>${\varkappa}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜙</xml2tex:character>
         <xml2tex:string>${\phi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜚</xml2tex:character>
         <xml2tex:string>${\varrho}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜛</xml2tex:character>
         <xml2tex:string>${\varpi}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜞</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜟</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Delta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜣</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Theta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜦</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Lambda}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜩</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Xi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜫</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜮</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Sigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜰</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Upsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜱</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Phi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜳</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Psi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜴</xml2tex:character>
         <xml2tex:string>${\mathbfit{\Omega}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜶</xml2tex:character>
         <xml2tex:string>${\mathbfit{\alpha}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜷</xml2tex:character>
         <xml2tex:string>${\mathbfit{\beta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜸</xml2tex:character>
         <xml2tex:string>${\mathbfit{\gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜹</xml2tex:character>
         <xml2tex:string>${\mathbfit{\delta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜺</xml2tex:character>
         <xml2tex:string>${\mathbfit{\varepsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜻</xml2tex:character>
         <xml2tex:string>${\mathbfit{\zeta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜼</xml2tex:character>
         <xml2tex:string>${\mathbfit{\eta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜽</xml2tex:character>
         <xml2tex:string>${\mathbfit{\theta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜾</xml2tex:character>
         <xml2tex:string>${\mathbfit{\iota}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝜿</xml2tex:character>
         <xml2tex:string>${\mathbfit{\kappa}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝀</xml2tex:character>
         <xml2tex:string>${\mathbfit{\lambda}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝁</xml2tex:character>
         <xml2tex:string>${\mathbfit{\mu}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝂</xml2tex:character>
         <xml2tex:string>${\mathbfit{\nu}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝃</xml2tex:character>
         <xml2tex:string>${\mathbfit{\xi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝅</xml2tex:character>
         <xml2tex:string>${\mathbfit{\pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝆</xml2tex:character>
         <xml2tex:string>${\mathbfit{\rho}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝇</xml2tex:character>
         <xml2tex:string>${\mathbfit{\varsigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝈</xml2tex:character>
         <xml2tex:string>${\mathbfit{\sigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝉</xml2tex:character>
         <xml2tex:string>${\mathbfit{\tau}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝊</xml2tex:character>
         <xml2tex:string>${\mathbfit{\upsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝋</xml2tex:character>
         <xml2tex:string>${\mathbfit{\varphi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝌</xml2tex:character>
         <xml2tex:string>${\mathbfit{\chi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝍</xml2tex:character>
         <xml2tex:string>${\mathbfit{\psi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝎</xml2tex:character>
         <xml2tex:string>${\mathbfit{\omega}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝐</xml2tex:character>
         <xml2tex:string>${\mathbfit{\epsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝑</xml2tex:character>
         <xml2tex:string>${\mathbfit{\vartheta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝓</xml2tex:character>
         <xml2tex:string>${\mathbfit{\phi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝔</xml2tex:character>
         <xml2tex:string>${\mathbfit{\varrho}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝕</xml2tex:character>
         <xml2tex:string>${\mathbfit{\varpi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝘</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝙</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Delta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝝</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Theta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝠</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Lambda}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝣</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Xi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝥</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝨</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Sigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝪</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Upsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝫</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Phi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝭</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Psi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝮</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\Omega}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝰</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\alpha}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝱</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\beta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝲</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝳</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\delta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝴</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\varepsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝵</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\zeta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝶</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\eta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝷</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\theta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝸</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\iota}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝹</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\kappa}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝺</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\lambda}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝻</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\mu}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝼</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\nu}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝽</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\xi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝝿</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞀</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\rho}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞁</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\varsigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞂</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\sigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞃</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\tau}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞄</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\upsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞅</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\varphi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞆</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\chi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞇</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\psi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞈</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\omega}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞊</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\epsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞋</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\vartheta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞍</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\phi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞎</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\varrho}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞏</xml2tex:character>
         <xml2tex:string>${\mathsfbf{\varpi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞒</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞓</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Delta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞗</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Theta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞚</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Lambda}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞝</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Xi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞟</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞢</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Sigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞤</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Upsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞥</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Phi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞧</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Psi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞨</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\Omega}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞪</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\alpha}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞫</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\beta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞬</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\gamma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞭</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\delta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞮</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\varepsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞯</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\zeta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞰</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\eta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞱</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\theta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞲</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\iota}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞳</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\kappa}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞴</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\lambda}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞵</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\mu}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞶</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\nu}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞷</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\xi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞹</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\pi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞺</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\rho}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞻</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\varsigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞼</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\sigma}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞽</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\tau}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞾</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\upsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝞿</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\varphi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟀</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\chi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟁</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\psi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟂</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\omega}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟄</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\epsilon}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟅</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\vartheta}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟇</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\phi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟈</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\varrho}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟉</xml2tex:character>
         <xml2tex:string>${\mathsfbfit{\varpi}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟎</xml2tex:character>
         <xml2tex:string>${\mathbf{0}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟏</xml2tex:character>
         <xml2tex:string>${\mathbf{1}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟐</xml2tex:character>
         <xml2tex:string>${\mathbf{2}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟑</xml2tex:character>
         <xml2tex:string>${\mathbf{3}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟒</xml2tex:character>
         <xml2tex:string>${\mathbf{4}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟓</xml2tex:character>
         <xml2tex:string>${\mathbf{5}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟔</xml2tex:character>
         <xml2tex:string>${\mathbf{6}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟕</xml2tex:character>
         <xml2tex:string>${\mathbf{7}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟖</xml2tex:character>
         <xml2tex:string>${\mathbf{8}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟗</xml2tex:character>
         <xml2tex:string>${\mathbf{9}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟘</xml2tex:character>
         <xml2tex:string>${\mathbb{0}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟙</xml2tex:character>
         <xml2tex:string>${\mathbb{1}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟚</xml2tex:character>
         <xml2tex:string>${\mathbb{2}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟛</xml2tex:character>
         <xml2tex:string>${\mathbb{3}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟜</xml2tex:character>
         <xml2tex:string>${\mathbb{4}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟝</xml2tex:character>
         <xml2tex:string>${\mathbb{5}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟞</xml2tex:character>
         <xml2tex:string>${\mathbb{6}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟟</xml2tex:character>
         <xml2tex:string>${\mathbb{7}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟠</xml2tex:character>
         <xml2tex:string>${\mathbb{8}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟡</xml2tex:character>
         <xml2tex:string>${\mathbb{9}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟢</xml2tex:character>
         <xml2tex:string>${\mathsf{0}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟣</xml2tex:character>
         <xml2tex:string>${\mathsf{1}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟤</xml2tex:character>
         <xml2tex:string>${\mathsf{2}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟥</xml2tex:character>
         <xml2tex:string>${\mathsf{3}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟦</xml2tex:character>
         <xml2tex:string>${\mathsf{4}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟧</xml2tex:character>
         <xml2tex:string>${\mathsf{5}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟨</xml2tex:character>
         <xml2tex:string>${\mathsf{6}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟩</xml2tex:character>
         <xml2tex:string>${\mathsf{7}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟪</xml2tex:character>
         <xml2tex:string>${\mathsf{8}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟫</xml2tex:character>
         <xml2tex:string>${\mathsf{9}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟬</xml2tex:character>
         <xml2tex:string>${\mathsfbf{0}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟭</xml2tex:character>
         <xml2tex:string>${\mathsfbf{1}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟮</xml2tex:character>
         <xml2tex:string>${\mathsfbf{2}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟯</xml2tex:character>
         <xml2tex:string>${\mathsfbf{3}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟰</xml2tex:character>
         <xml2tex:string>${\mathsfbf{4}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟱</xml2tex:character>
         <xml2tex:string>${\mathsfbf{5}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟲</xml2tex:character>
         <xml2tex:string>${\mathsfbf{6}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟳</xml2tex:character>
         <xml2tex:string>${\mathsfbf{7}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟴</xml2tex:character>
         <xml2tex:string>${\mathsfbf{8}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟵</xml2tex:character>
         <xml2tex:string>${\mathsfbf{9}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟶</xml2tex:character>
         <xml2tex:string>${\mathtt{0}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟷</xml2tex:character>
         <xml2tex:string>${\mathtt{1}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟸</xml2tex:character>
         <xml2tex:string>${\mathtt{2}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟹</xml2tex:character>
         <xml2tex:string>${\mathtt{3}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟺</xml2tex:character>
         <xml2tex:string>${\mathtt{4}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟻</xml2tex:character>
         <xml2tex:string>${\mathtt{5}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟼</xml2tex:character>
         <xml2tex:string>${\mathtt{6}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟽</xml2tex:character>
         <xml2tex:string>${\mathtt{7}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟾</xml2tex:character>
         <xml2tex:string>${\mathtt{8}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>𝟿</xml2tex:character>
         <xml2tex:string>${\mathtt{9}}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>🔔</xml2tex:character>
         <xml2tex:string>${\bell}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>🡨</xml2tex:character>
         <xml2tex:string>${\leftarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>🡩</xml2tex:character>
         <xml2tex:string>${\uparrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>🡪</xml2tex:character>
         <xml2tex:string>${\rightarrow}$</xml2tex:string>
      </xml2tex:char>
      <xml2tex:char>
         <xml2tex:character>🡫</xml2tex:character>
         <xml2tex:string>${\downarrow}$</xml2tex:string>
      </xml2tex:char>
   </xsl:variable>
   <xsl:variable name="regex-map" as="element(xml2tex:regex)*"/>
   <xsl:variable name="regex-regex" as="xs:string" select="'()'"/>
   <xsl:function name="xml2tex:filter-regex-document" as="element(xml2tex:regex)*">
      <xsl:param name="context" as="node()?"/>
      <xsl:param name="regex-map" as="element(xml2tex:regex)*"/>
   </xsl:function>
   <xsl:template match="text()[normalize-space()]                                [matches(., $texregex) or matches(., $xml2tex:simpleeq-regex) or matches(., $xml2tex:root-regex) or matches(normalize-unicode(., 'NFD'),  $xml2tex:diacrits-regex) or matches(normalize-unicode(., 'NFKD'), $xml2tex:fraction-regex)]"
                 mode="xml2tex">
      <xsl:variable name="simplemath"
                    select="if(matches(., $xml2tex:simpleeq-regex))                                                then string-join(xml2tex:convert-simplemath(.), '')                                               else ."
                    as="xs:string"/>
      <xsl:variable name="handle-regexes" select="$simplemath" as="xs:string"/>
      <xsl:variable name="utf2tex"
                    select="if(matches($handle-regexes, $texregex))                                  then string-join(xml2tex:utf2tex(.., $handle-regexes, $charmap, (), $texregex), '')                                  else $handle-regexes"
                    as="xs:string"/>
      <xsl:choose>
         <xsl:when test="$decompose-diacritics                          and (   matches(normalize-unicode($utf2tex, 'NFD'),  $xml2tex:diacritical-marks-regex)                              or matches(normalize-unicode($utf2tex, 'NFKD'), $xml2tex:fraction-regex))">
            <xsl:value-of select="string-join(xml2tex:convert-diacrits($utf2tex, $texregex, $xml2tex:diacrits, $charmap), '')"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:value-of select="$utf2tex"/>
         </xsl:otherwise>
      </xsl:choose>
   </xsl:template>
   <xsl:template match="text()" mode="char-context"/>
   <xsl:template match="*" mode="char-context" as="xs:string?" priority="-1"/>
   <xsl:template match="/" mode="char-context" as="xs:string?" priority="-1"/>
   <xsl:template match="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and not(@css:font-style eq 'italic')]"
                 mode="char-context"
                 as="xs:string?">
      <xsl:param name="char-in-doc" as="xs:string?"/>
      <xsl:choose>
         <xsl:when test="$char-in-doc = 'Γ'">
            <xsl:sequence select="'$\boldsymbol{\Upgamma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Δ'">
            <xsl:sequence select="'$\boldsymbol{\Updelta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Θ'">
            <xsl:sequence select="'$\boldsymbol{\Uptheta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Λ'">
            <xsl:sequence select="'$\boldsymbol{\Uplambda}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ξ'">
            <xsl:sequence select="'$\boldsymbol{\Upxi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Π'">
            <xsl:sequence select="'$\boldsymbol{\Uppi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Σ'">
            <xsl:sequence select="'$\boldsymbol{\Upsigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Υ'">
            <xsl:sequence select="'$\boldsymbol{\Upupsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Φ'">
            <xsl:sequence select="'$\boldsymbol{\Upphi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ψ'">
            <xsl:sequence select="'$\boldsymbol{\Uppsi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ω'">
            <xsl:sequence select="'$\boldsymbol{\Upomega}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'α'">
            <xsl:sequence select="'$\boldsymbol{\upalpha}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'β'">
            <xsl:sequence select="'$\boldsymbol{\upbeta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'γ'">
            <xsl:sequence select="'$\boldsymbol{\upgamma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'δ'">
            <xsl:sequence select="'$\boldsymbol{\updelta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ε'">
            <xsl:sequence select="'$\boldsymbol{\upvarepsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Φ'">
            <xsl:sequence select="'$\boldsymbol{\upzeta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Χ'">
            <xsl:sequence select="'$\boldsymbol{\upeta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'θ'">
            <xsl:sequence select="'$\boldsymbol{\uptheta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ι'">
            <xsl:sequence select="'$\boldsymbol{\upiota}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'κ'">
            <xsl:sequence select="'$\boldsymbol{\upkappa}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'λ'">
            <xsl:sequence select="'$\boldsymbol{\uplambda}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'μ'">
            <xsl:sequence select="'$\boldsymbol{\upmu}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ν'">
            <xsl:sequence select="'$\boldsymbol{\upnu}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ξ'">
            <xsl:sequence select="'$\boldsymbol{\upxi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'π'">
            <xsl:sequence select="'$\boldsymbol{\uppi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ρ'">
            <xsl:sequence select="'$\boldsymbol{\uprho}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ς'">
            <xsl:sequence select="'$\boldsymbol{\mathrm{\varsigma}}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'σ'">
            <xsl:sequence select="'$\boldsymbol{\upsigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'τ'">
            <xsl:sequence select="'$\boldsymbol{\uptau}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'υ'">
            <xsl:sequence select="'$\boldsymbol{\upupsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'φ'">
            <xsl:sequence select="'$\boldsymbol{\upvarphi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'χ'">
            <xsl:sequence select="'$\boldsymbol{\upchi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ψ'">
            <xsl:sequence select="'$\boldsymbol{\uppsi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ω'">
            <xsl:sequence select="'$\boldsymbol{\upomega}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϑ'">
            <xsl:sequence select="'$\boldsymbol{\upvartheta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϕ'">
            <xsl:sequence select="'$\boldsymbol{\upphi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϖ'">
            <xsl:sequence select="'$\boldsymbol{\upvarpi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϴ'">
            <xsl:sequence select="'$\boldsymbol{\Uptheta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = '∆'">
            <xsl:sequence select="'$\boldsymbol{\Updelta}$'"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match>
               <xsl:with-param name="char-in-doc" select="$char-in-doc"/>
            </xsl:next-match>
         </xsl:otherwise>
      </xsl:choose>
   </xsl:template>
   <xsl:template match="*[(@css:font-weight eq 'bold' or exists(key('style', @role)[@css:font-weight eq 'bold'])) and (@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic']))]"
                 mode="char-context"
                 as="xs:string?">
      <xsl:param name="char-in-doc" as="xs:string?"/>
      <xsl:choose>
         <xsl:when test="$char-in-doc = 'Γ'">
            <xsl:sequence select="'$\boldsymbol{\Gamma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Δ'">
            <xsl:sequence select="'$\boldsymbol{\Delta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Θ'">
            <xsl:sequence select="'$\boldsymbol{\Theta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Λ'">
            <xsl:sequence select="'$\boldsymbol{\Lambda}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ξ'">
            <xsl:sequence select="'$\boldsymbol{\Xi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Π'">
            <xsl:sequence select="'$\boldsymbol{\Pi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Σ'">
            <xsl:sequence select="'$\boldsymbol{\Sigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Υ'">
            <xsl:sequence select="'$\boldsymbol{\Upsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Φ'">
            <xsl:sequence select="'$\boldsymbol{\Phi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ψ'">
            <xsl:sequence select="'$\boldsymbol{\Psi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ω'">
            <xsl:sequence select="'$\boldsymbol{\Omega}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'α'">
            <xsl:sequence select="'$\boldsymbol{\alpha}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'β'">
            <xsl:sequence select="'$\boldsymbol{\beta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'γ'">
            <xsl:sequence select="'$\boldsymbol{\gamma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'δ'">
            <xsl:sequence select="'$\boldsymbol{\delta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ε'">
            <xsl:sequence select="'$\boldsymbol{\varepsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ζ'">
            <xsl:sequence select="'$\boldsymbol{\zeta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'η'">
            <xsl:sequence select="'$\boldsymbol{\eta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'θ'">
            <xsl:sequence select="'$\boldsymbol{\theta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ι'">
            <xsl:sequence select="'$\boldsymbol{\iota}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'κ'">
            <xsl:sequence select="'$\boldsymbol{\kappa}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'λ'">
            <xsl:sequence select="'$\boldsymbol{\lambda}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'μ'">
            <xsl:sequence select="'$\boldsymbol{\mu}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ν'">
            <xsl:sequence select="'$\boldsymbol{\nu}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ξ'">
            <xsl:sequence select="'$\boldsymbol{\xi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'π'">
            <xsl:sequence select="'$\boldsymbol{\pi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ρ'">
            <xsl:sequence select="'$\boldsymbol{\rho}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ς'">
            <xsl:sequence select="'$\boldsymbol{\varsigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'σ'">
            <xsl:sequence select="'$\boldsymbol{\sigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'τ'">
            <xsl:sequence select="'$\boldsymbol{\tau}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'υ'">
            <xsl:sequence select="'$\boldsymbol{\upsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'φ'">
            <xsl:sequence select="'$\boldsymbol{\varphi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'χ'">
            <xsl:sequence select="'$\boldsymbol{\chi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ψ'">
            <xsl:sequence select="'$\boldsymbol{\psi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ω'">
            <xsl:sequence select="'$\boldsymbol{\omega}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϑ'">
            <xsl:sequence select="'$\boldsymbol{\vartheta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϕ'">
            <xsl:sequence select="'$\boldsymbol{\phi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϖ'">
            <xsl:sequence select="'$\boldsymbol{\varpi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ϙ'">
            <xsl:sequence select="'$\boldsymbol{\Koppa}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϙ'">
            <xsl:sequence select="'$\boldsymbol{\koppa}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ϛ'">
            <xsl:sequence select="'$\boldsymbol{\Stigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϛ'">
            <xsl:sequence select="'$\boldsymbol{\stigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ϝ'">
            <xsl:sequence select="'$\boldsymbol{\Digamma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϝ'">
            <xsl:sequence select="'$\boldsymbol{\digamma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ϟ'">
            <xsl:sequence select="'$\boldsymbol{\Koppa}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϟ'">
            <xsl:sequence select="'$\boldsymbol{\koppa}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ϡ'">
            <xsl:sequence select="'$\boldsymbol{\Sampi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϡ'">
            <xsl:sequence select="'$\boldsymbol{\sampi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϱ'">
            <xsl:sequence select="'$\boldsymbol{\varrho}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϴ'">
            <xsl:sequence select="'$\boldsymbol{\Theta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϵ'">
            <xsl:sequence select="'$\boldsymbol{\epsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = '϶'">
            <xsl:sequence select="'$\boldsymbol{\backepsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = '∆'">
            <xsl:sequence select="'$\boldsymbol{\Delta}$'"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match>
               <xsl:with-param name="char-in-doc" select="$char-in-doc"/>
            </xsl:next-match>
         </xsl:otherwise>
      </xsl:choose>
   </xsl:template>
   <xsl:template match="*[(@css:font-style eq 'italic' or exists(key('style', @role)[@css:font-style eq 'italic'])) and not(@css:font-weight eq 'bold')]"
                 mode="char-context"
                 as="xs:string?">
      <xsl:param name="char-in-doc" as="xs:string?"/>
      <xsl:choose>
         <xsl:when test="$char-in-doc = 'Γ'">
            <xsl:sequence select="'${\Gamma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Δ'">
            <xsl:sequence select="'${\Delta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Θ'">
            <xsl:sequence select="'${\Theta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Λ'">
            <xsl:sequence select="'${\Lambda}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ξ'">
            <xsl:sequence select="'${\Xi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Π'">
            <xsl:sequence select="'${\Pi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Σ'">
            <xsl:sequence select="'${\Sigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Υ'">
            <xsl:sequence select="'${\Upsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Φ'">
            <xsl:sequence select="'${\Phi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ψ'">
            <xsl:sequence select="'${\Psi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'Ω'">
            <xsl:sequence select="'${\Omega}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'α'">
            <xsl:sequence select="'${\alpha}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'β'">
            <xsl:sequence select="'${\beta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'γ'">
            <xsl:sequence select="'${\gamma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'δ'">
            <xsl:sequence select="'${\delta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ε'">
            <xsl:sequence select="'${\varepsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ζ'">
            <xsl:sequence select="'${\zeta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'η'">
            <xsl:sequence select="'${\eta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'θ'">
            <xsl:sequence select="'${\theta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ι'">
            <xsl:sequence select="'${\iota}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'κ'">
            <xsl:sequence select="'${\kappa}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'λ'">
            <xsl:sequence select="'${\lambda}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'μ'">
            <xsl:sequence select="'${\mu}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ν'">
            <xsl:sequence select="'${\nu}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ξ'">
            <xsl:sequence select="'${\xi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'π'">
            <xsl:sequence select="'${\pi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ρ'">
            <xsl:sequence select="'${\rho}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ς'">
            <xsl:sequence select="'${\varsigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'σ'">
            <xsl:sequence select="'${\sigma}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'τ'">
            <xsl:sequence select="'${\tau}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'υ'">
            <xsl:sequence select="'${\upsilon}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'φ'">
            <xsl:sequence select="'${\varphi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'χ'">
            <xsl:sequence select="'${\chi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ψ'">
            <xsl:sequence select="'${\psi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ω'">
            <xsl:sequence select="'${\omega}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϑ'">
            <xsl:sequence select="'${\vartheta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϕ'">
            <xsl:sequence select="'${\phi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϖ'">
            <xsl:sequence select="'${\varpi}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = 'ϴ'">
            <xsl:sequence select="'${\Theta}$'"/>
         </xsl:when>
         <xsl:when test="$char-in-doc = '∆'">
            <xsl:sequence select="'${\Delta}$'"/>
         </xsl:when>
         <xsl:otherwise>
            <xsl:next-match>
               <xsl:with-param name="char-in-doc" select="$char-in-doc"/>
            </xsl:next-match>
         </xsl:otherwise>
      </xsl:choose>
   </xsl:template>
   <xsl:template match="processing-instruction('cals2tabular')                         |processing-instruction('htmltabs')                         |processing-instruction('latex')"
                 mode="xml2tex">
      <xsl:value-of select="replace(., '\s\s+', ' ')"/>
   </xsl:template>
   <xsl:template match="processing-instruction('mml2tex')                         |processing-instruction('mathtype')"
                 mode="clean">
      <xsl:value-of select="replace(., '\s\s+', ' ')"/>
   </xsl:template>
   <xsl:template match="processing-instruction('passthru')" mode="clean">
      <xsl:value-of select="."/>
   </xsl:template>
   <xsl:template match="processing-instruction() | comment() " mode="clean"/>
   <xsl:template match="text()" mode="clean">
      <xsl:variable name="mask-backslash-space"
                    as="xs:string"
                    select="replace(., '(^|[^\\])((\\\\)+)?(\\ )', '$1$2{$4}', 'm')"/>
      <xsl:variable name="remove-whitespace-before-pagebreaks"
                    as="xs:string"
                    select="replace($mask-backslash-space, '([^\p{Zs}])\p{Zs}*\n?\p{Zs}*(\\(pagebreak|break|newline|\\))', '$1$2', 'm')"/>
      <xsl:value-of select="$remove-whitespace-before-pagebreaks"/>
   </xsl:template>
</xsl:stylesheet>
