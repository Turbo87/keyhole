# Rule Texts

The built-in rule set editions in `keyhole-engine/src/rule_sets.rs` cite clauses of these documents.

| Edition ID | Document |
| --- | --- |
| `DAeC SWO 2026` | <https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf> |
| `FAI Annex A 2025a` | <https://www.fai.org/sites/default/files/document/file/SC3A_2025a.pdf> |

To search a document for a clause, download it to a scratch directory and convert it to text with its page layout:

```sh
curl -sSL -o swo.pdf https://www.daec.de/media/files/2026/Segelflug/Regelwerke/SWO2026.pdf
pdftotext -layout swo.pdf swo.txt
```
