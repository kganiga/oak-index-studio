export const SAMPLES: Record<string, string> = {
  SQL2: `SELECT * FROM [cq:Page] AS p
WHERE ISDESCENDANTNODE(p, '/content/wknd')
AND p.[jcr:content/cq:template] = '/conf/wknd/settings/wcm/templates/article-page'
AND p.[jcr:content/cq:lastModified] > CAST('2025-01-01T00:00:00.000Z' AS DATE)
ORDER BY p.[jcr:content/cq:lastModified] DESC`,

  XPath: `/jcr:root/content/dam/wknd//element(*, dam:Asset)
[jcr:contains(., 'surfing') and jcr:content/@dam:status = 'approved']
order by @jcr:created descending`,

  QueryBuilder: `type=cq:Page
path=/content/wknd
1_property=jcr:content/cq:template
1_property.value=/conf/wknd/settings/wcm/templates/article-page
2_property=jcr:content/sling:resourceType
2_property.value=wknd/components/page
daterange.property=jcr:content/cq:lastModified
daterange.lowerBound=2025-01-01
orderby=@jcr:content/cq:lastModified
orderby.sort=desc
p.limit=20`,

  Explain: `[nt:base] as [p] /* traverse "/content//*"
where isdescendantnode([p], [/content/wknd]) ... */`,

  ExistingXML: `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"
          xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
          xmlns:oak="http://jackrabbit.apache.org/oak/ns/1.0"
          xmlns:cq="http://www.day.com/jcr/cq/1.0"
    jcr:primaryType="oak:QueryIndexDefinition"
    type="lucene"
    compatVersion="{Long}2"
    async="[async]"
    includedPaths="[/content]"
    queryPaths="[/content/wknd]"
    evaluatePathRestrictions="{Boolean}true">
    <indexRules jcr:primaryType="nt:unstructured">
        <cq:Page jcr:primaryType="nt:unstructured">
            <properties jcr:primaryType="nt:unstructured">
                <lastModified
                    jcr:primaryType="nt:unstructured"
                    name="jcr:content/cq:lastModified"
                    propertyIndex="{Boolean}true"/>
                <legacyStatus
                    jcr:primaryType="nt:unstructured"
                    name="jcr:content/status"
                    propertyIndex="{Boolean}true"/>
            </properties>
        </cq:Page>
    </indexRules>
</jcr:root>`
};
