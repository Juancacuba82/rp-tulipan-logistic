const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const oldTheadRptulipan = `                                    <thead style="background: #f1f5f9;">
                                        <tr>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">ENTRY DATE</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">CONTAINER #</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">CUSTOMER</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">PHONE</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">SIZE</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">TYPE</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">CONDITION</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">ORIGIN</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">NOTES</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">DAYS / COST</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: center; font-size: 0.8rem;">ACTION</th>
                                        </tr>
                                    </thead>`.replace(/\r\n/g, '\n');

const newThead = `                                    <thead style="background: #f1f5f9;">
                                        <tr>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">N° CONT</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">SIZE</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">DATE IN</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">DATE OUT</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">ORDER# IN</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">ORDER# OUT</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">LIFTS</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">DAYS</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">DAYS COST</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">LIFTS COST</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">TOTAL</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">CUSTOMER</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">PHONE</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">TYPE</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">CONDITION</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: left; font-size: 0.8rem;">NOTES</th>
                                            <th style="padding: 12px 10px; border: 1px solid #475569; color: #0f172a; font-weight: 900; text-align: center; font-size: 0.8rem;">ACTION</th>
                                        </tr>
                                    </thead>`;

// Normalize file
html = html.replace(/\r\n/g, '\n');

// Replace all occurrences using regex
const regex = new RegExp(oldTheadRptulipan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'g');
let matchCount = (html.match(regex) || []).length;
console.log('Matches found:', matchCount);
html = html.replace(regex, newThead);

fs.writeFileSync('index.html', html);
console.log('Done');
