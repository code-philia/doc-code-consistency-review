<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns="http://www.w3.org/1998/Math/MathML"
                xmlns:mml="http://www.w3.org/1998/Math/MathML"
                xmlns:mml2tex="http://transpect.io/mml2tex"
                xmlns:xs="http://www.w3.org/2001/XMLSchema"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xml:base="file:///home/lenovo/ubushare/cf/docx2tex/mml-normalize/xsl/mml-normalize.xsl"
                version="2.0"
                exclude-result-prefixes="#all"
                xpath-default-namespace="http://www.w3.org/1998/Math/MathML">
   <xsl:import href="operators.xsl"/>
   <xsl:import href="function-names.xsl"/>
   <xsl:import href="tidy-up-simple.xsl"/>
   <xsl:param name="remove-mspace-treshold-em" select="0.16" as="xs:decimal"/>
   <xsl:param name="remove-mspace-next-to-operator-treshold-em"
              select="0.25"
              as="xs:decimal"/>
   <xsl:param name="chars-from-which-to-convert-mi-to-mtext"
              select="5"
              as="xs:integer"/>
   <xsl:variable name="whitespace-regex" select="'\p{Zs}​-‏'" as="xs:string"/>
   <xsl:variable name="wrapper-element-names"
                 select="('msup',                                                        'msub',                                                        'msubsup',                                                        'mfrac',                                                        'mroot',                                                        'mmultiscripts',                                                        'mover',                                                        'munder',                                                        'munderover')"
                 as="xs:string+"/>
   <xsl:variable name="sil-units-regex"
                 select="'(m|g|s|A|K|mol|cd|rad|sr|GHz|Hz|N|Nm|Pa|J|W|C|V|F|Ω|S|Wb|T|H|°|°C|lm|lx|Bq|Gy|Sv|kat)'"
                 as="xs:string"/>
   <xsl:variable name="sil-unit-prefixes-regex"
                 select="'(G|M|k|d|c|m|µ|n|p|f)'"
                 as="xs:string"/>
   <xsl:variable name="greek-chars-regex" select="'[Γ-ϵ]'" as="xs:string"/>
   <xsl:template match="mml:math[every $i in .//mml:*                                  satisfies (string-length(normalize-space($i)) eq 0 and not($i/@*))]                        |//processing-instruction('mathtype')[string-length(normalize-space(replace(., '\$', ''))) eq 0]"
                 mode="mml2tex-preprocess">
      <xsl:message select="'[WARNING] empty equation removed:&#xA;', ."/>
   </xsl:template>
   <xsl:template match="*[   count(mi) gt 1                           or count(mtext) gt 1                           or count(mspace) gt 1]                         [not(local-name() = $wrapper-element-names)]"
                 mode="mml2tex-grouping">
      <xsl:copy>
         <xsl:apply-templates select="@*" mode="#current"/>
         <xsl:for-each-group select="*"
                             group-adjacent="concat(local-name(),                                string-join(for $i in @* except (@xml:space|@width)                                             return concat($i/local-name(), $i), '-'),                                matches(., concat('^[\p{L}\p{P}', $whitespace-regex, ']+$'), 'i') or self::mspace[not(@linebreak)],                                matches(., concat('^', $mml2tex:functions-names-regex, '$')),                                matches(., concat('^', $greek-chars-regex, '$'))                                )">
            <xsl:choose>
               <xsl:when test="current-group()/self::mi[every $i in 1 to ($chars-from-which-to-convert-mi-to-mtext - 1)                                                       satisfies following-sibling::*[$i]/local-name() eq 'mi']">
                  <xsl:element name="mtext">
                     <xsl:attribute name="mathvariant" select="(@mathvariant, 'italic')[1]"/>
                     <xsl:if test="not(every $i in current-group()/@mathvariant                                    satisfies $i eq 'normal')">
                        <xsl:attribute name="mathvariant" select="(@mathvariant, 'italic')[1]"/>
                     </xsl:if>
                     <xsl:apply-templates select="current-group()/@*, current-group()/node()" mode="#current"/>
                  </xsl:element>
               </xsl:when>
               <xsl:when test="exists(current-group()/self::mtext                                     | current-group()/self::mi[@mathvariant]                                    | current-group()/self::mspace)                             and (every $w in current-group()/@width satisfies (matches($w, '^[\d.]+em$')))">
                  <xsl:element name="{name()}">
                     <xsl:apply-templates select="current-group()/@*[not(local-name() eq 'width')]"
                                          mode="#current"/>
                     <xsl:if test="current-group()/@width">
                        <xsl:variable name="total-width"
                                      select="sum(for $i in current-group()/@width                                                                 return xs:decimal(replace(mml:replace-literal-mspace($i), 'em$', '')))"
                                      as="xs:decimal"/>
                        <xsl:attribute name="width" select="concat(xs:string($total-width), 'em')"/>
                     </xsl:if>
                     <xsl:apply-templates select="current-group()/node()" mode="#current"/>
                  </xsl:element>
               </xsl:when>
               <xsl:otherwise>
                  <xsl:apply-templates select="current-group()" mode="#current"/>
               </xsl:otherwise>
            </xsl:choose>
         </xsl:for-each-group>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="mrow[count(*) gt 1]                            [every $e in *                              satisfies $e[                               self::mtext[                                 string-join(('_', for $a in @* return (name($a), $a)), '')                                 =                                 string-join(('_', for $a in parent::mrow/mtext[1]/@* return (name($a), $a)), '')                               ]                             ]                            ]"
                 mode="mml2tex-grouping"
                 priority="3">
      <mtext>
         <xsl:apply-templates select="*[1]/@*, */node()" mode="#current"/>
      </mtext>
   </xsl:template>
   <xsl:template match="mrow[count(*) eq 1][not(@*)]" mode="mml2tex-preprocess">
      <xsl:apply-templates mode="#current"/>
   </xsl:template>
   <xsl:template match="mo[. = '.']                          [preceding-sibling::*[1]/self::mo[. = '.'][not(preceding-sibling::*[1]/self::mo[. = '.'])]]                          [following-sibling::*[1]/self::mo[. = '.'][not(following-sibling::*[1]/self::mo[. = '.'])]]"
                 mode="mml2tex-preprocess">
      <mo>
         <xsl:value-of select="'…'"/>
      </mo>
   </xsl:template>
   <xsl:function name="mml:replace-literal-mspace" as="xs:string">
      <xsl:param name="width" as="xs:string"/>
      <xsl:variable name="em-width"
                    as="xs:decimal?"
                    select="     if($width eq 'veryverythinmathspace')          then  0.055               else if($width eq 'verythinmathspace')              then  0.111               else if($width eq 'thinmathspace')                  then  0.167               else if($width eq 'mediummathspace')                then  0.222               else if($width eq 'thickmathspace')                 then  0.277               else if($width eq 'verythickmathspace')             then  0.333               else if($width eq 'veryverythickmathspace')         then  0.388               else if($width eq 'negativeveryverythinmathspace')  then -0.055               else if($width eq 'negativeverythinmathspace')      then -0.111               else if($width eq 'negativethinmathspace')          then -0.167               else if($width eq 'negativemediummathspace')        then -0.222               else if($width eq 'negativethickmathspace')         then -0.277               else if($width eq 'negativeverythickmathspace')     then -0.333               else if($width eq 'negativeveryverythickmathspace') then -0.388               else                                                     ()"/>
      <xsl:sequence select="if(exists($em-width)) then concat($em-width, 'em') else $width"/>
   </xsl:function>
   <xsl:template match="mspace[matches(@width, '^[a-z]+$')]/@width"
                 mode="mml2tex-grouping">
      <xsl:attribute name="width" select="mml:replace-literal-mspace(.)"/>
   </xsl:template>
   <xsl:template match="mover[@accent = 'true'][count(*) = 2]/*[2][self::mi[not(@mathvariant)][. = ('˜', '~')]]"
                 mode="mml2tex-grouping">
      <mo>̃</mo>
   </xsl:template>
   <xsl:template match="mi[. = '˗']" mode="mml2tex-grouping">
      <mtext>
         <xsl:text>‑</xsl:text>
      </mtext>
   </xsl:template>
   <xsl:template match="  mo[. = '.']                            [not(following-sibling::*[1]/self::mo[. = '.'])]                            [preceding-sibling::*[1]/self::mo[. = '.']]                            [preceding-sibling::*[2]/self::mo[. = '.']]                            [not(preceding-sibling::*[3]/self::mo[. = '.'])]                        | mo[. = '.']                            [not(preceding-sibling::*[1]/self::mo[. = '.'])]                            [following-sibling::*[1]/self::mo[. = '.']]                            [following-sibling::*[2]/self::mo[. = '.']]                            [not(following-sibling::*[3]/self::mo[. = '.'])]"
                 mode="mml2tex-preprocess"/>
   <xsl:template match="*[name() = ('mi', 'mn', 'mo')]                         [(not(normalize-space(.)) or matches(., concat('^[', $whitespace-regex, ']+$')))                           and not(processing-instruction())]"
                 mode="mml2tex-preprocess"/>
   <xsl:template match="msubsup[every $i in (*[2], *[3]) satisfies matches($i, concat('^[', $whitespace-regex, ']+$')) or not(exists($i/node()))]"
                 priority="10"
                 mode="mml2tex-preprocess">
      <xsl:apply-templates select="*[1]" mode="#current"/>
   </xsl:template>
   <xsl:template match="msubsup[exists(*[2]/node())                                 and (*[3]/self::mspace                                     or matches(*[3], concat('^[', $whitespace-regex, ']+$'))                                      or not(exists(*[3]/node())))]"
                 mode="mml2tex-preprocess">
      <msub>
         <xsl:apply-templates select="@*, node() except *[3]" mode="#current"/>
      </msub>
   </xsl:template>
   <xsl:template match="math/mn[following-sibling::*[1][self::mn]]                               [every $a in @* satisfies following-sibling::*[1]/@*[name() = name($a)][. = $a]]                               [not(following-sibling::*[2][self::mn])]"
                 mode="mml2tex-preprocess"
                 priority="+10.2">
      <xsl:copy>
         <xsl:apply-templates select="@*, node(), following-sibling::*[1]/node()" mode="#current"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="math/mn[preceding-sibling::*[1][self::mn]]                               [every $a in @* satisfies preceding-sibling::*[1]/@*[name() = name($a)][. = $a]]                               [not(preceding-sibling::*[2][self::mn])]"
                 mode="mml2tex-preprocess"
                 priority="+10.2"/>
   <xsl:template match="*[local-name() = ('mover', 'munder')]                         [*[2]/self::mspace                          or matches(*[2], concat('^[', $whitespace-regex, ']+$'))]"
                 mode="mml2tex-preprocess">
      <xsl:apply-templates select="*[1]" mode="#current"/>
   </xsl:template>
   <xsl:template match="mtext[matches(., '.[̀-ͯ˙]')]" mode="mml2tex-grouping">
      <xsl:variable name="context" select="."/>
      <xsl:analyze-string select="." regex="(.)([̀-ͯ˙])">
         <xsl:matching-substring>
            <mover>
               <mi>
                  <xsl:attribute name="mathvariant" select="'normal'"/>
                  <xsl:apply-templates select="$context/@*"/>
                  <xsl:value-of select="regex-group(1)"/>
               </mi>
               <mo>
                  <xsl:value-of select="regex-group(2)"/>
               </mo>
            </mover>
         </xsl:matching-substring>
         <xsl:non-matching-substring>
            <xsl:element name="{if(string-length(.) = 1) then 'mi' else 'mtext'}">
               <xsl:attribute name="mathvariant" select="'normal'"/>
               <xsl:apply-templates select="$context/@*"/>
               <xsl:value-of select="."/>
            </xsl:element>
         </xsl:non-matching-substring>
      </xsl:analyze-string>
   </xsl:template>
   <xsl:template mode="mml2tex-grouping"
                 match="*[local-name() = ('math', 'mrow')]/mi[following-sibling::node()[1]/self::mo[matches(., '^[̀-ͯ˙]$')]]">
      <mover>
         <mi>
            <xsl:apply-templates select="@*, node()"/>
         </mi>
         <mo>
            <xsl:text>˙</xsl:text>
         </mo>
      </mover>
   </xsl:template>
   <xsl:template mode="mml2tex-grouping"
                 match="*[local-name() = ('math', 'mrow')]/mo[matches(., '^[̀-ͯ˙]$')][preceding-sibling::node()[1]/self::mi]"/>
   <xsl:template match="*[local-name() = ('mi', 'mn', 'mtext')]                         [following-sibling::*[1][self::msubsup                                                   and *[1][matches(., concat('^[', $whitespace-regex, ']$'))]                                                  and not(*[2][matches(., concat('^[', $whitespace-regex, ']$'))])                                                  and not(*[3][matches(., concat('^[', $whitespace-regex, ']$'))])                                                  ]]"
                 mode="mml2tex-preprocess"
                 priority="+10.1"/>
   <xsl:template match="msubsup[*[1][matches(., concat('^[', $whitespace-regex, ']$'))]                                and not(*[2][matches(., concat('^[', $whitespace-regex, ']$'))])                                and not(*[3][matches(., concat('^[', $whitespace-regex, ']$'))])]                                [preceding-sibling::*[1][local-name() = ('mi', 'mn', 'mtext')]]/*[1][matches(., concat('^[',                                                                                                                       $whitespace-regex,                                                                                                                       ']$'))]"
                 mode="mml2tex-preprocess">
      <xsl:copy-of select="parent::*/preceding-sibling::*[1]"/>
   </xsl:template>
   <xsl:template match="msubsup[exists(*[3]/node())                                 and (*[2]/self::mspace                                     or matches(*[2], concat('^[', $whitespace-regex, ']+$'))                                      or not(exists(*[2]/node())))]"
                 mode="mml2tex-preprocess">
      <msup>
         <xsl:apply-templates select="@*, node() except *[2]" mode="#current"/>
      </msup>
   </xsl:template>
   <xsl:template match="*[local-name() = ('msub', 'msup')]                         [*[2]/self::mspace                           or matches(*[2], concat('^[', $whitespace-regex, ']+$'))                           or not(exists(*[2]/node()))]"
                 mode="mml2tex-preprocess">
      <xsl:apply-templates select="*[1]" mode="#current"/>
   </xsl:template>
   <xsl:template match="*[local-name() = ('msub', 'msup')]                         [*[1][self::mspace or self::mrow[count(*) = 1][mspace]]]"
                 mode="mml2tex-preprocess">
      <xsl:copy>
         <xsl:apply-templates select="@*" mode="#current"/>
         <xsl:apply-templates select="preceding-sibling::*[1]" mode="move-into-msub-or-msup"/>
         <xsl:apply-templates select="*[2]" mode="#current"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="*[local-name() = ('msub', 'msup')]                         [*[1][self::mspace or self::mrow[count(*) = 1][mspace]]]/*[1]                       |*[following-sibling::msup                         [*[1][self::mspace or self::mrow[count(*) = 1][mspace]]]                         [not(*[2] = $superscript-looking-chars)]]"
                 mode="mml2tex-preprocess"/>
   <xsl:template match="*" mode="move-into-msub-or-msup">
      <xsl:copy>
         <xsl:apply-templates select="@*, node()" mode="mml2tex-preprocess"/>
      </xsl:copy>
   </xsl:template>
   <xsl:variable name="superscript-looking-chars"
                 as="xs:string+"
                 select="'&#34;', '''', '^', '`', '°',  '⁺', '⁻', '⁼', '⁽', '⁾', 'ⁿ'"/>
   <xsl:template match="msup[*[2][. = $superscript-looking-chars]]"
                 mode="mml2tex-preprocess"
                 priority="5">
      <mrow>
         <xsl:apply-templates mode="#current"/>
      </mrow>
   </xsl:template>
   <xsl:variable name="superscript-digits"
                 as="xs:string+"
                 select="'²', '³', '¹', '⁰', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'"/>
   <xsl:template match="mo[. = $superscript-digits][preceding-sibling::*[1]]"
                 mode="mml2tex-preprocess">
      <msup>
         <xsl:apply-templates select="preceding-sibling::*[1]" mode="move-into-msub-or-msup"/>
         <mn>
            <xsl:value-of select="translate(., string-join($superscript-digits, ''), '2310456789')"/>
         </mn>
      </msup>
   </xsl:template>
   <xsl:template match="*[following-sibling::*[1][self::mo[. = $superscript-digits]]]"
                 mode="mml2tex-preprocess"
                 priority="15"/>
   <xsl:template match="mspace[mml:remove-mspace-treshold-em_candidate(.)]                              [not(parent::*/local-name() = $wrapper-element-names)]"
                 mode="mml2tex-preprocess">
      <xsl:text> </xsl:text>
   </xsl:template>
   <xsl:template match="munderover[*[3][self::mspace[mml:remove-mspace-treshold-em_candidate(.)]]]"
                 mode="mml2tex-preprocess">
      <munder>
         <xsl:apply-templates select="@*, node() except *[3]" mode="#current"/>
      </munder>
   </xsl:template>
   <xsl:function name="mml:remove-mspace-treshold-em_candidate" as="xs:boolean">
      <xsl:param name="mspace-element" as="element()"/>
      <xsl:sequence select="exists(                             $mspace-element[not(@linebreak)]                                            [@width[matches(., '^[\d.]+em$')]                                                   [xs:decimal(replace(., 'em$', '')) le $remove-mspace-treshold-em]]                                            [not(preceding-sibling::*[1]/self::mtext or following-sibling::*[1]/self::mtext)]                                            [not(parent::mtd and count(parent::*/*) = 1)]                           )"/>
   </xsl:function>
   <xsl:template match="mspace[not(@linebreak)]                              [@width[matches(., '^[\d.]+em$')]                                     [xs:decimal(replace(., 'em$', '')) le $remove-mspace-next-to-operator-treshold-em]]                              [preceding-sibling::*[1]/self::mo or following-sibling::*[1]/self::mo]                              [not(parent::mtd and count(parent::*/*) = 1)]"
                 priority="5"
                 mode="mml2tex-preprocess">
  </xsl:template>
   <xsl:template mode="mml2tex-preprocess"
                 priority="2"
                 match="mspace[@width[matches(., '^[\d.]+em$')]                                     [xs:decimal(replace(., 'em$', '')) le $remove-mspace-next-to-operator-treshold-em]]                              [matches(normalize-space(string-join(preceding-sibling::*[1]//text(), '')), '\d$')                               and matches(normalize-space(string-join(following-sibling::*[1], '')),                                            concat('^', $sil-unit-prefixes-regex, '?', $sil-units-regex))]">
      <mspace width="0.16em">
         <xsl:apply-templates select="@* except @linebreak" mode="#current"/>
      </mspace>
   </xsl:template>
   <xsl:template match="*[local-name() = ('mi', 'mtext')][. eq ' ']                         [matches(normalize-space(string-join(preceding-sibling::*[1]//text(), '')), '\d$')                          and matches(normalize-space(string-join(following-sibling::*[1], '')), concat('^', $sil-unit-prefixes-regex, '?', $sil-units-regex))]"
                 mode="mml2tex-preprocess"
                 priority="2">
      <mspace width="0.16em"/>
   </xsl:template>
   <xsl:template match="msup[count(*) gt 2]            |msub[count(*) gt 2]"
                 mode="mml2tex-preprocess">
      <xsl:copy>
         <xsl:apply-templates select="@*" mode="#current"/>
         <mrow>
            <xsl:apply-templates select="*[not(position() eq last())]" mode="#current"/>
         </mrow>
         <xsl:apply-templates select="*[position() eq last()]" mode="#current"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="msup[count(*) eq 2][matches(*[2], '^''+$')]"
                 mode="mml2tex-preprocess">
      <mrow>
         <xsl:apply-templates select="*" mode="#current"/>
      </mrow>
   </xsl:template>
   <xsl:template match="mmultiscripts/mrow[mmultiscripts]" mode="mml2tex-preprocess">
      <xsl:copy>
         <xsl:apply-templates select="@*, *[1]" mode="#current"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="mmultiscripts[mrow/mmultiscripts]" mode="mml2tex-preprocess">
      <xsl:copy>
         <xsl:apply-templates select="@*, node()" mode="#current"/>
      </xsl:copy>
      <xsl:apply-templates select="mrow/*[position() gt 1]" mode="#current"/>
   </xsl:template>
   <xsl:template match="mtd[maligngroup]" mode="mml2tex-preprocess">
      <xsl:variable name="cur" select="." as="element()"/>
      <xsl:if test="$cur/*[1]/self::maligngroup and ../../mtr/mtd[not(*[1]/self::maligngroup)]">
         <mtd/>
      </xsl:if>
      <xsl:for-each-group select="node()" group-starting-with="maligngroup">
         <xsl:element name="mtd" namespace="http://www.w3.org/1998/Math/MathML">
            <xsl:attribute name="columnalign">
               <xsl:choose>
                  <xsl:when test="$cur/@columnalign">
                     <xsl:sequence select="$cur/@columnalign"/>
                  </xsl:when>
                  <xsl:when test="$cur/@groupalign">
                     <xsl:sequence select="$cur/@groupalign"/>
                  </xsl:when>
                  <xsl:when test="current-group()[1]/self::maligngroup">left</xsl:when>
                  <xsl:otherwise>right</xsl:otherwise>
               </xsl:choose>
            </xsl:attribute>
            <xsl:apply-templates select="$cur/@*, current-group()" mode="#current"/>
         </xsl:element>
      </xsl:for-each-group>
   </xsl:template>
   <xsl:template match="mtd[1][empty(maligngroup)][exists(../../mtr[mtd/maligngroup])]"
                 mode="mml2tex-preprocess">
      <xsl:variable name="max"
                    as="xs:integer"
                    select="xs:integer(max(for $mtr in ../../mtr return count($mtr/mtd/maligngroup)))"/>
      <xsl:variable name="cur" as="xs:integer" select="count(../mtd/maligngroup)"/>
      <xsl:copy>
         <xsl:attribute name="columnspan" select="$max - $cur + 1"/>
         <xsl:apply-templates select="@*, node()" mode="#current"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="mtd/maligngroup | mtd/*[last()][self::mspace][@linebreak= 'newline']"
                 mode="mml2tex-preprocess"/>
   <xsl:template match="mtable[mtr[matches(replace(., '\s', ''), '^[\.]+$')]                                  [count(.//*) gt 5]]"
                 mode="mml2tex-preprocess">
      <xsl:variable name="row-indexes-with-poorly-drawn-lines"
                    as="xs:integer*"
                    select="mtr[matches(replace(., '\s', ''), '^[\.]+$')]                              [count(.//*) gt 5]/(count(preceding-sibling::mtr)+1)"/>
      <xsl:variable name="rowlines" as="xs:string*" select="tokenize(@rowlines, '\s')"/>
      <xsl:copy>
         <xsl:attribute name="rowlines"
                        select="for $i in (1 to count(mtr))                              return ('dashed'[$i = $row-indexes-with-poorly-drawn-lines], $rowlines[$i], 'none')[1]"/>
         <xsl:attribute name="mml2tex:rowlines"
                        select="for $i in (1 to count(mtr))                              return ('dotted'[$i = $row-indexes-with-poorly-drawn-lines], $rowlines[$i], 'none')[1]"/>
         <xsl:for-each select="mtr">
            <xsl:copy>
               <xsl:apply-templates select="@*" mode="#current"/>
               <xsl:choose>
                  <xsl:when test="position() = $row-indexes-with-poorly-drawn-lines">
                     <mtd class="mml-normalize:removed"/>
                  </xsl:when>
                  <xsl:otherwise>
                     <xsl:apply-templates select="@*, node()" mode="#current"/>
                  </xsl:otherwise>
               </xsl:choose>
            </xsl:copy>
         </xsl:for-each>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="*[local-name() = ('mo', 'mi', 'mtext', 'mn')]                         [matches(., concat('^', $mml2tex:functions-names-regex, '\d+([,\.]\d+)*$'))]"
                 mode="mml2tex-preprocess">
      <xsl:choose>
         <xsl:when test="parent::*/local-name() = $wrapper-element-names">
            <mrow>
               <xsl:apply-templates select="mml:separate-function-names(.)" mode="#current"/>
            </mrow>
         </xsl:when>
         <xsl:otherwise>
            <xsl:apply-templates select="mml:separate-function-names(.)" mode="#current"/>
         </xsl:otherwise>
      </xsl:choose>
   </xsl:template>
   <xsl:function name="mml:separate-function-names" as="element()+">
      <xsl:param name="mml-element" as="element()"/>
      <xsl:variable name="attributes" select="$mml-element/@*" as="attribute()*"/>
      <xsl:analyze-string select="$mml-element" regex="{$mml2tex:functions-names-regex}">
         <xsl:matching-substring>
            <mi>
               <xsl:apply-templates select="$attributes"/>
               <xsl:value-of select="."/>
            </mi>
         </xsl:matching-substring>
         <xsl:non-matching-substring>
            <mn>
               <xsl:value-of select="."/>
            </mn>
         </xsl:non-matching-substring>
      </xsl:analyze-string>
   </xsl:function>
   <xsl:variable name="non-text-element-names"
                 select="('mfrac', 'mn', 'mo')"
                 as="xs:string*"/>
   <xsl:template match="mtext[matches(., '^[\p{Zs}​]+$')]                             [                               preceding-sibling::*[1][local-name() = $non-text-element-names]                               and                               following-sibling::*[1][local-name() = $non-text-element-names]                             ]"
                 mode="mml2tex-preprocess"/>
   <xsl:template match="text()[matches(., '[-󰀀-󿿿􀀀-􏿿]')]" mode="mml2tex-preprocess">
      <xsl:analyze-string select="." regex="[-󰀀-󿿿􀀀-􏿿]">
         <xsl:matching-substring>
            <mglyph alt="{.}"/>
         </xsl:matching-substring>
         <xsl:non-matching-substring>
            <xsl:value-of select="."/>
         </xsl:non-matching-substring>
      </xsl:analyze-string>
   </xsl:template>
   <xsl:variable name="mi-regex"
                 as="xs:string"
                 select="concat('((',                                 $mml2tex:functions-names-regex,                                 ')|([a-zA-ZΑ-϶])'                                ,')')"/>
   <xsl:template match="mtext[matches(., concat('^\s*', $mi-regex, '\s*$'))]"
                 mode="mml2tex-preprocess">
      <xsl:element name="{mml:gen-name(parent::*, 'mi')}">
         <xsl:attribute name="mathvariant" select="'normal'"/>
         <xsl:apply-templates select="@*" mode="#current"/>
         <xsl:value-of select="normalize-space(.)"/>
      </xsl:element>
   </xsl:template>
   <xsl:template match="mtext[matches(., '^\s*[0-9]+\s*$')]" mode="mml2tex-preprocess">
      <xsl:element name="{mml:gen-name(parent::*, 'mn')}">
         <xsl:apply-templates select="@*" mode="#current"/>
         <xsl:value-of select="normalize-space(.)"/>
      </xsl:element>
   </xsl:template>
   <xsl:variable name="non-whitespace-element-names"
                 select="('mn', 'mo')"
                 as="xs:string+"/>
   <xsl:variable name="punctuation-marks"
                 select="('.', ',', ';', '․', '‥', '…')"
                 as="xs:string+"/>
   <xsl:template match="mtext[matches(., concat('^[', $whitespace-regex, ']+$'))]                             [not(parent::*/local-name() = $wrapper-element-names)]                             [not(parent::mrow[count(*) eq 1][not(@*)][parent::*/local-name() = $wrapper-element-names])]                             [preceding::*[1]/ancestor-or-self::*[local-name() = ($non-whitespace-element-names, $non-text-element-names)][not(. = $punctuation-marks)] or                              following::*[1]/self::*[local-name() = ($non-whitespace-element-names, $non-text-element-names)][not(. = $punctuation-marks)]]"
                 mode="mml2tex-preprocess"
                 priority="1">
    
  </xsl:template>
   <xsl:template match="mtext[matches(., concat('^\s*', $mml2tex:operators-regex, '\s*$'))]                             [not(matches(., concat('^[', $whitespace-regex, ']+$')))]"
                 mode="mml2tex-preprocess">
      <xsl:element name="{mml:gen-name(parent::*, 'mo')}">
         <xsl:apply-templates select="@*" mode="#current"/>
         <xsl:value-of select="normalize-space(.)"/>
      </xsl:element>
   </xsl:template>
   <xsl:variable name="mml2tex:text-char-regex"
                 as="xs:string"
                 select="concat('[',                                '–-—',                                '“-‟',                                'À-Ö',                                 'Ù-ö',                                'ù-ǽ',                                ']')"/>
   <xsl:template match="mtext[not(   matches(.,                                           concat('^[', $whitespace-regex, ']+$'))                                   or processing-instruction())]"
                 mode="mml2tex-preprocess"
                 priority="10">
      <xsl:param name="regular-words-regex"
                 select="'(\p{L}\p{L}+)([-\s]\p{L}\p{L}+)+\s*'"
                 as="xs:string"
                 tunnel="yes"/>
      <xsl:variable name="context" as="element(mtext)" select="."/>
      <xsl:variable name="current" select="." as="element(mtext)"/>
      <xsl:variable name="parent" select="parent::*" as="element()"/>
      <xsl:variable name="attributes" select="@*" as="attribute()*"/>
      <xsl:variable name="mathvariant"
                    select="(@mathvariant,                             'bold-italic'[current()/@fontweight='bold']                                         [current()/@fontstyle='italic'],                             @fontweight,                             @fontstyle,                             'normal')[1]"
                    as="xs:string"/>
      <xsl:variable name="new-mathml" as="document-node()">
         <xsl:document>
            <xsl:analyze-string select="." regex="{$regular-words-regex}">
               <xsl:matching-substring>
                  <xsl:element name="{mml:gen-name($parent, 'mtext')}">
                     <xsl:apply-templates select="$attributes" mode="#current"/>
                     <xsl:value-of select="."/>
                  </xsl:element>
               </xsl:matching-substring>
               <xsl:non-matching-substring>
                  <xsl:analyze-string select="." regex="{$mml2tex:operators-regex}">
                     <xsl:matching-substring>
                        <xsl:element name="{mml:gen-name($parent, 'mo')}">
                           <xsl:apply-templates select="$attributes" mode="#current"/>
                           <xsl:value-of select="normalize-space(.)"/>
                        </xsl:element>
                     </xsl:matching-substring>
                     <xsl:non-matching-substring>
                        <xsl:analyze-string select="."
                                            regex="{concat('((\s)', $mi-regex, '(\s))|(^(\s?)', $mi-regex, '(\s?)$)|((\s)', $mi-regex, '$)|(^', $mi-regex, '(\s))')}">
                           <xsl:matching-substring>
                              <xsl:variable name="space-before"
                                            as="xs:string"
                                            select="string-join((regex-group(2), regex-group(9), regex-group(16)), '')"/>
                              <xsl:variable name="space-after"
                                            as="xs:string"
                                            select="string-join((regex-group(7), regex-group(14), regex-group(26)), '')"/>
                              <xsl:if test="string-length($space-before) gt 0">
                                 <xsl:element name="{mml:gen-name($parent, 'mspace')}">
                                    <xsl:attribute name="width" select="'0.25em'"/>
                                    <xsl:attribute name="class" select="'keep-only-if-next-to-mtext'"/>
                                 </xsl:element>
                              </xsl:if>
                              <xsl:element name="{mml:gen-name($parent, 'mi')}">
                                 <xsl:attribute name="mathvariant" select="$mathvariant"/>
                                 <xsl:apply-templates select="$attributes[not(local-name() eq 'mathvariant')]"
                                                      mode="#current"/>
                                 <xsl:value-of select="normalize-space(.)"/>
                              </xsl:element>
                              <xsl:if test="string-length($space-after) gt 0">
                                 <xsl:element name="{mml:gen-name($parent, 'mspace')}">
                                    <xsl:attribute name="width" select="'0.25em'"/>
                                    <xsl:attribute name="class" select="'keep-only-if-next-to-mtext'"/>
                                 </xsl:element>
                              </xsl:if>
                           </xsl:matching-substring>
                           <xsl:non-matching-substring>
                              <xsl:analyze-string select="." regex="[0-9]+">
                                 <xsl:matching-substring>
                                    <xsl:element name="{mml:gen-name($parent, 'mn')}">
                                       <xsl:apply-templates select="$attributes" mode="#current"/>
                                       <xsl:value-of select="normalize-space(.)"/>
                                    </xsl:element>
                                 </xsl:matching-substring>
                                 <xsl:non-matching-substring>
                                    <xsl:analyze-string select="." regex="([a-zA-Z]+)('+)+">
                                       <xsl:matching-substring>
                                          <xsl:element name="{mml:gen-name($parent, 'mi')}">
                                             <xsl:attribute name="mathvariant" select="$mathvariant"/>
                                             <xsl:apply-templates select="$attributes[not(local-name() eq 'mathvariant')]"
                                                                  mode="#current"/>
                                             <xsl:value-of select="regex-group(1)"/>
                                          </xsl:element>
                                          <xsl:element name="{mml:gen-name($parent, 'mo')}">
                                             <xsl:apply-templates select="$attributes" mode="#current"/>
                                             <xsl:value-of select="regex-group(2)"/>
                                          </xsl:element>
                                       </xsl:matching-substring>
                                       <xsl:non-matching-substring>
                                          <xsl:analyze-string select="." regex="[ðıΑ-ωϐ-ϒϕ]">
                                             <xsl:matching-substring>
                                                <xsl:element name="{mml:gen-name($parent, 'mi')}">
                                                   <xsl:attribute name="mathvariant" select="$mathvariant"/>
                                                   <xsl:apply-templates select="$attributes[not(local-name() eq 'mathvariant')]"
                                                                        mode="#current"/>
                                                   <xsl:value-of select="normalize-space(.)"/>
                                                </xsl:element>
                                             </xsl:matching-substring>
                                             <xsl:non-matching-substring>
                                                <xsl:choose>
                                                   <xsl:when test="string-length(normalize-space(.)) &lt; min((4, $chars-from-which-to-convert-mi-to-mtext))                                                 and not($current/@xml:space eq 'preserve')                                                 and not(matches(., $mml2tex:text-char-regex))                                                 ">
                                                      <xsl:element name="{mml:gen-name($parent, 'mi')}">
                                                         <xsl:attribute name="mathvariant" select="$mathvariant"/>
                                                         <xsl:apply-templates select="$attributes[not(local-name() eq 'mathvariant')]"
                                                                              mode="#current"/>
                                                         <xsl:value-of select="normalize-space(.)"/>
                                                      </xsl:element>
                                                   </xsl:when>
                                                   <xsl:when test="normalize-space(.)">
                                                      <xsl:element name="{mml:gen-name($parent, 'mtext')}">
                                                         <xsl:apply-templates select="$attributes" mode="#current"/>
                                                         <xsl:value-of select="."/>
                                                      </xsl:element>
                                                   </xsl:when>
                                                </xsl:choose>
                                             </xsl:non-matching-substring>
                                          </xsl:analyze-string>
                                       </xsl:non-matching-substring>
                                    </xsl:analyze-string>
                                 </xsl:non-matching-substring>
                              </xsl:analyze-string>
                           </xsl:non-matching-substring>
                        </xsl:analyze-string>
                     </xsl:non-matching-substring>
                  </xsl:analyze-string>
               </xsl:non-matching-substring>
            </xsl:analyze-string>
         </xsl:document>
      </xsl:variable>
      <xsl:choose>
         <xsl:when test="count($new-mathml/*) = 0">
            <xsl:message terminate="yes"
                         select="'Unexpected empty result from ', $context, ' (not totally unexpected: it can happen for empty mtext elements)'"/>
         </xsl:when>
         <xsl:when test="count($new-mathml/*) gt 1">
            <mrow>
               <xsl:apply-templates select="$new-mathml" mode="mml2tex-postprocess-preprocess"/>
            </mrow>
         </xsl:when>
         <xsl:otherwise>
            <xsl:apply-templates select="$new-mathml" mode="mml2tex-postprocess-preprocess"/>
         </xsl:otherwise>
      </xsl:choose>
   </xsl:template>
   <xsl:template match="mml:mspace[@class = 'keep-only-if-next-to-mtext']                                  [empty(preceding-sibling::*[1]/self::mml:mtext)]                                  [empty(following-sibling::*[1]/self::mml:mtext)]"
                 mode="mml2tex-postprocess-preprocess"/>
   <xsl:template match="mml:mspace/@class[. = 'keep-only-if-next-to-mtext']"
                 mode="mml2tex-postprocess-preprocess"/>
   <xsl:function name="mml:gen-name" as="xs:string">
      <xsl:param name="parent" as="element()"/>
      <xsl:param name="name" as="xs:string"/>
      <xsl:value-of select="if(matches($parent/name(), ':'))                            then concat(substring-before($parent/name(), ':'), ':', $name)                            else $name"/>
   </xsl:function>
   <xsl:variable name="accent-regex" select="'^[`¨´¸ˆˇ˘-˝̀-̸⃐-⃯]$'" as="xs:string"/>
   <xsl:template match="*[empty(self::mi | self::mstyle)][empty(*)][ancestor::math][matches(., $accent-regex)]                       |mstyle[count(*) eq 1 and *[empty(*)][matches(., $accent-regex)]]"
                 mode="mml2tex-preprocess"
                 priority="20">
      <mi>
         <xsl:apply-templates select="(self::mstyle/* | self::*[empty(self::mstyle)])/(@* | node())"
                              mode="#current"/>
      </mi>
   </xsl:template>
   <xsl:template match="mi[matches(.,'´')]/text()"
                 mode="mml2tex-preprocess"
                 priority="20">
      <xsl:sequence select="replace(.,'´','′')"/>
   </xsl:template>
   <xsl:template match="*|@*|processing-instruction()"
                 mode="mml2tex-grouping mml2tex-preprocess mml2tex-postprocess-preprocess">
      <xsl:copy>
         <xsl:apply-templates select="@*|node()|processing-instruction()" mode="#current"/>
      </xsl:copy>
   </xsl:template>
</xsl:stylesheet>
