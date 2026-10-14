# 0025: Profilen uppdateras genom Fråga AI, via appens eget API, och svaren visar vilka verktyg som kördes

- **Status:** Föreslaget, ämnet "Profilen" som ett val i panelen ersatt av [0026](0026-fraga-ai-valjer-amne-sjalv.md)
- **Datum:** 2026-10-14
- **Gäller:** hur ett företag ändrar sin profil i chatten, var ändringen sparas, och hur panelen visar vad som gjordes
  bakom ett svar

## Sammanhang

Företagare vill kunna skriva "vi har numera tolv anställda" i Fråga AI och få profilen uppdaterad, i stället för att
gå till formuläret. Den första tanken var att låta Eneos assistent nå den inloggade profilen via MCP. Det går inte
ihop med [beslut 0004](0004-eneo-api-and-own-mcp-server.md): MCP-servern läser bara offentliga data och exponerar aldrig
företagsdata. Det går inte heller tekniskt: Eneo anropar MCP-servern med spacets nyckel, inte med användarens session,
så servern vet inte vilket företag som frågar. Eneos `forward_identity` skickar Eneo-användarens identitet, och med en
servicenyckel ingenting. En token i frågetexten skulle läcka in i Eneos session och vara en väg för injicerad text att
styra skrivningar.

Samtidigt ville vi att chatten säger vad den gjorde: vilka verktyg som kördes bakom ett svar, så att läsaren ser om
svaret om avtalsspärren kom från lagtexten via `sok_lou` eller ur modellens minne. Eneo rapporterar verktygsanrop i
svaret (`mcp_tool_references`, med `mcp_tool_name`) och strömmar händelsen `tool_call` medan de pågår; appen läser i
dag bara det färdiga svaret.

## Beslut

**Profilen ändras genom appen, aldrig genom MCP.** Fråga AI får ämnet "Profilen" för en inloggad företagare. Ett
meddelande går till `POST /api/profile/chat` med webbläsarens session. AI-uppgiften `uppdatera_profil` läser bara
önskemålet: den får profilen, CPV-kandidater som vår sökning hittat för meddelandets ord, tidigare meddelanden och
meddelandet, och svarar med `ProfileChange`, där varje fält är null när det inte ändras. Appen tillämpar ändringen med
samma validering som profilformuläret (`services.profiles.update_profile`): en CPV-kod måste komma från kandidaterna,
och en kod som tas bort måste finnas i profilen. En oklar fråga ändrar ingenting och ställer en motfråga. Efter en
sparad ändring bedöms träffarna på nytt, som efter formuläret. MCP-servern är oförändrad och fortsatt bara läsande.

**Svaren listar verktygen som kördes.** Varje svar i panelen (underlaget, reglerna och profilen) får `tools`: Eneos
MCP-anrop, som motorn läser ur `mcp_tool_references` (`EngineRun.tools`), och appens egna steg runt anropet, som
"Sök i underlaget · 12 träffar", "Hämta profilen" och "Spara profilen". Etiketterna är verktygens titlar, samma som
MCP-servern registrerar dem med, och ett test håller dem i takt. Panelen visar dem med designsystemets
`ChatToolCalls` under svaret. Listan är efterhandsinformation: appen strömmar inte stegen medan de pågår.

Det starkaste alternativet var skrivande MCP-verktyg med en engångstoken i frågan. Det valdes bort av skälen ovan.
Strömmade verktygshändelser (Eneos `tool_call` via en strömmande fråga och NDJSON till webbläsaren) valdes bort nu,
eftersom det kräver en annan transport i både motor och webbapp; listan i svaret ger det mesta av värdet.

## Konsekvenser

- Eneo får en assistent till, "Uppdatera profilen". `anbudsklar eneo provision` måste köras igen i varje instans,
  annars svarar profilchatten med "AI-motorn är inte rätt inställd just nu".
- Den heuristiska motorn läser enkla mönster (antal anställda, omsättning med enhet, ISO-certifikat, orter efter "i",
  meningar om försäkring och referensuppdrag, "beskrivning:" och CPV-kandidater vars benämning meddelandet nämner),
  se `backend/src/anbudsklar/ai/profile_rules.py`. Allt annat ger en motfråga.
- Ett meddelande till profilen loggas inte; anropet räknas under Drift › AI-användning som `uppdatera_profil`.
- Ett svar som sparats i webbläsaren före ändringen saknar `tools` och visas utan verktygsrad.
- Vill vi visa verktygen medan de körs är nästa steg strömning: Eneos `tool_call`-händelser genom en strömmande
  fråga, och appens egna steg som händelser, till panelen.
- Dokumentationen följer: [AI-uppgifterna](../ai-tasks.md), [Design](../design.md), [Eneo-integration](../eneo-integration.md)
  och [Drift](../operations.md).
