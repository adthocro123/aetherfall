using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;

namespace Aetherfall.EditorTools
{
    /// <summary>
    /// A small JSON reader for the art pipeline's files (layout.json and the meta JSON), which JsonUtility can't read:
    /// they use dictionaries keyed by name and rows of mixed numbers. Objects become Dictionary&lt;string, object&gt;,
    /// arrays List&lt;object&gt;, numbers double, plus string, bool and null.
    /// </summary>
    public static class MiniJson
    {
        public static object Parse(string text)
        {
            var p = new Parser(text);
            object v = p.Value();
            p.SkipSpace();
            if (!p.AtEnd) throw p.Error("unexpected text after the JSON value");
            return v;
        }

        sealed class Parser
        {
            readonly string s;
            int i;

            public Parser(string text) { s = text ?? ""; }

            public bool AtEnd => i >= s.Length;

            public FormatException Error(string what)
            {
                int line = 1;
                for (int k = 0; k < i && k < s.Length; k++) if (s[k] == '\n') line++;
                return new FormatException($"JSON: {what} at line {line}");
            }

            public void SkipSpace()
            {
                while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
            }

            public object Value()
            {
                SkipSpace();
                if (AtEnd) throw Error("unexpected end");
                char c = s[i];
                switch (c)
                {
                    case '{': return Obj();
                    case '[': return Arr();
                    case '"': return Str();
                    case 't': Word("true"); return true;
                    case 'f': Word("false"); return false;
                    case 'n': Word("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return Num();
                        throw Error($"unexpected '{c}'");
                }
            }

            void Word(string w)
            {
                if (string.CompareOrdinal(s, i, w, 0, w.Length) != 0) throw Error($"expected {w}");
                i += w.Length;
            }

            Dictionary<string, object> Obj()
            {
                var d = new Dictionary<string, object>();
                i++;
                SkipSpace();
                if (i < s.Length && s[i] == '}') { i++; return d; }
                while (true)
                {
                    SkipSpace();
                    if (AtEnd || s[i] != '"') throw Error("expected a key");
                    string key = Str();
                    SkipSpace();
                    if (AtEnd || s[i] != ':') throw Error("expected ':'");
                    i++;
                    d[key] = Value();
                    SkipSpace();
                    if (AtEnd) throw Error("unexpected end in object");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; return d; }
                    throw Error("expected ',' or '}'");
                }
            }

            List<object> Arr()
            {
                var a = new List<object>();
                i++;
                SkipSpace();
                if (i < s.Length && s[i] == ']') { i++; return a; }
                while (true)
                {
                    a.Add(Value());
                    SkipSpace();
                    if (AtEnd) throw Error("unexpected end in array");
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; return a; }
                    throw Error("expected ',' or ']'");
                }
            }

            string Str()
            {
                var sb = new StringBuilder();
                i++;
                while (true)
                {
                    if (AtEnd) throw Error("unterminated string");
                    char c = s[i++];
                    if (c == '"') return sb.ToString();
                    if (c != '\\') { sb.Append(c); continue; }
                    if (AtEnd) throw Error("bad escape");
                    char e = s[i++];
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (i + 4 > s.Length) throw Error("bad \\u escape");
                            sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                            i += 4;
                            break;
                        default: throw Error($"bad escape \\{e}");
                    }
                }
            }

            double Num()
            {
                int start = i;
                if (s[i] == '-') i++;
                while (i < s.Length && "0123456789.eE+-".IndexOf(s[i]) >= 0) i++;
                string t = s.Substring(start, i - start);
                if (!double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out double d)) throw Error($"bad number '{t}'");
                return d;
            }
        }
    }

    /// <summary>Typed reads from MiniJson values, with defaults for missing keys.</summary>
    public static class J
    {
        public static Dictionary<string, object> Obj(object o) =>
            o as Dictionary<string, object> ?? throw new FormatException("JSON: expected an object");

        public static List<object> Arr(object o) => o as List<object> ?? throw new FormatException("JSON: expected an array");

        public static object Get(Dictionary<string, object> d, string key) =>
            d != null && d.TryGetValue(key, out object v) ? v : null;

        public static bool Has(Dictionary<string, object> d, string key) => d != null && d.ContainsKey(key) && d[key] != null;

        public static string Str(Dictionary<string, object> d, string key, string def = "") =>
            Get(d, key) is string s ? s : def;

        public static float Num(object o, float def = 0f) => o is double d ? (float)d : o is bool b ? (b ? 1f : 0f) : def;

        public static float Num(Dictionary<string, object> d, string key, float def = 0f) => Num(Get(d, key), def);

        public static bool Bool(Dictionary<string, object> d, string key, bool def = false) => Get(d, key) is bool b ? b : def;

        public static Vector3 Vec3(object o)
        {
            var a = Arr(o);
            if (a.Count < 3) throw new FormatException("JSON: expected [x, y, z]");
            return new Vector3(Num(a[0]), Num(a[1]), Num(a[2]));
        }

        public static float[] Floats(object o)
        {
            var a = Arr(o);
            var r = new float[a.Count];
            for (int k = 0; k < a.Count; k++) r[k] = Num(a[k]);
            return r;
        }
    }
}
