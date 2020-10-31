const connection = require('../database/connection');

module.exports = {
  async index(req, res) {
    try {
      const { inscricaoImobiliaria, cnaes } = req.body;

      if (!inscricaoImobiliaria || inscricaoImobiliaria === '' || !cnaes) {
        return res.status(400).json({ erro: 'Inscrição inválida!' });
      }

      const inscricaoFormated = inscricaoImobiliaria.replace(/([^0-9])/g, '').substring(0, 14);

      const inscricaoTerritorial = await validaInscrica(inscricaoFormated);
      
      if (inscricaoTerritorial === '') {
        return res.status(400).json({ erro: 'Inscrição inválida!' });
      }

      const inscricaoTerritorialFormated = inscricaoTerritorial.replace(/([^0-9])/g, '');

      const leiMae = await getLeiMae(inscricaoFormated, inscricaoTerritorialFormated);

      if (leiMae === '') {
        return res.status(400).json({ erro: 'Inscrição não Geocodificada!' });
      }

      // const fl_response = await getEdificada(inscricaoFormated);

      const cnaesResult = [];

      for (cnaeCod of cnaes) {
        const cnaeFormated = cnaeCod.replace(/([^0-9])/g, '');

        let numTent = 0;
        let response = await getArrayUsos(cnaeFormated, leiMae, numTent);  
        numTent++;

        while (!response && numTent < 5) {
          response = await getArrayUsos(cnaeFormated, leiMae, numTent);
          numTent++;
        }

        if (!response) {
          cnaesResult.push({
            cnae: cnaeCod,
            erro: 'Código de Uso Inválido.'
          });
          continue;
        }

        const array_parecer = await getParecer(inscricaoFormated, inscricaoTerritorialFormated, response.cd_classe, response.cd_secao);

      }
        

      //   if (array_parecer.length > 0) {
      //     for (let i = 0; i < array_parecer.length; i++) {
      //       var parecer = '';

      //       //CONCATENANDO PARECER COM LIMITACOES DE USO
      //       if (parecer === '') { //CASO NAO TENHA CAIDO EM NENHUM CASO ESPECIAL(excecao)
      //         parecer = array_parecer[i]['parecer'] + '. ';
      //         if (array_parecer[i]['comp_adeq_uso'] !== '') {
      //           parecer += array_parecer[i]['comp_adeq_uso'] + ' = ';
      //         }
      //         if (array_parecer[i]['limitacao']!== '') {
      //           parecer += array_parecer[i]['limitacao'];
      //         }
      //         if (array_parecer[i]['tp_uso'] !== '') {
      //           if (parecer !== '') {
      //             parecer += ' ' + array_parecer[i]['tp_uso'] + ' = ' + array_parecer[i]['uso'] + '.';
      //           } else {
      //             parecer += array_parecer[i]['tp_uso'] + ' = ' + array_parecer[i]['uso'] + '.';
      //           }
      //         }
      //       }

      //       cnaesResult.push({
      //         cnae: cnaeCod,
      //         // status: array_parecer[i].status,
      //         lei: array_parecer[i].lei_2,
      //         lei_alteracao: array_parecer[i].lei,
      //         nm_zon: array_parecer[i].nm_zon,
      //         de_zon: array_parecer[i].zon,
      //         parecer,
      //         porcentagem: array_parecer[i].porcentagem,
      //         viavel: (array_parecer[i].letra_parecer === 'A'),
      //       });
      //     }
      //   } else {
      //     cnaesResult.push({
      //       cnae: cnaeCod,
      //       viavel: false,
      //     })
      //   }
      // }

      // return res.json({ 
      //   inscricaoImobiliaria: inscricaoImobiliaria,
      //   fl_edificada: fl_response.fl_edificada,
      //   fl_edificada_desc : fl_response.fl_edificada_desc,
      //   cnaes: cnaesResult,
      // });

      return res.json({
        inscricaoFormated
      });

    } catch (err){
      return res.status(500).json({ erro: 'Internal server error.' });
    }
  },
};

async function validaInscrica(inscricaoImobiliaria) {
  try {
    const { rows } = await connection.raw(`
      SELECT territorial_id, ativo FROM urbano.autonomas
      WHERE replace(urbano.autonomas.inscricao ,'.','') = '${inscricaoImobiliaria}';
    `);

    if (!rows ||rows.length <= 0) return '';

    var cotrImobiliario = rows[0];

    if (!cotrImobiliario.ativo) return '';

    const { rows: cadLote } = await connection.raw(`
      SELECT ativo, inscricao FROM urbano.territoriais WHERE id = '${cotrImobiliario.territorial_id}'
    `);

    if (!cadLote ||cadLote.length <= 0) return '';

    return cadLote[0].inscricao;
  } catch (error) {
    console.log(error)
    throw new Error('Internal server error.');
  }
}

async function getLeiMae(inscricaoImobiliaria, inscricaoTerritorial) {
  try {
    const { rows: search } = await connection.raw(`
      select z.fields -> 'lei_2' as lei_2
      From urbano.zonas z, urbano.territoriais t
      where ST_Intersects(z.geoinformation, t.geoinformation)
      and replace(t.inscricao ,'.','') = '${inscricaoTerritorial}'
    `);

    let leiInsc = '';

    if (search && search.length > 0) leiInsc = search[0].lei_2;

    // Caso nao retorne nada eh pq area do lote estah completamente em cima de sv
    // if (leiInsc === '') {
    //   const { rows: search2 } = await connection.raw(`
    //     SELECT DISTINCT public.plan_zon_pd_sv.lei_2
    //     FROM ((ctu.cotr_imobiliario RIGHT JOIN public.cad_lote
    //     ON ctu.cotr_imobiliario.cd_lote = public.cad_lote.cd_lote)
    //     RIGHT JOIN public.plan_sv_join
    //     ON public.cad_lote.mslink = public.plan_sv_join.cd_mslink_lote)
    //     RIGHT JOIN public.plan_zon_pd_sv
    //     ON public.plan_sv_join.cd_mslink_sv = public.plan_zon_pd_sv.mslink
    //     WHERE ctu.cotr_imobiliario.nu_insc_imbl = '${inscricaoImobiliaria}'
    //   `);

    //   if (search2 && search2.length > 0) leiInsc = search2[0].lei_2;
    // }

    // // Caso nao retorne nada eh pq area do lote esta completamente em cima de projeto de engenharia
    // if (leiInsc === '') {
    //   const { rows: search3 } = await connection.raw(`
    //     SELECT DISTINCT public.plan_zon_pd_sv_proj.lei_2
    //     FROM ((ctu.cotr_imobiliario RIGHT JOIN public.cad_lote
    //     ON ctu.cotr_imobiliario.cd_lote = public.cad_lote.cd_lote)
    //     RIGHT JOIN public.plan_sv_proj_join
    //     ON public.cad_lote.mslink = public.plan_sv_proj_join.cd_mslink_lote)
    //     RIGHT JOIN public.plan_zon_pd_sv_proj
    //     ON public.plan_sv_proj_join.cd_mslink_sv = public.plan_zon_pd_sv_proj.mslink
    //     WHERE ctu.cotr_imobiliario.nu_insc_imbl = '${inscricaoImobiliaria}'
    //   `);

    //   if (search3 && search3.length > 0) leiInsc = search3[0].lei_2;
    // }

    // Se as três retornarem vazio é pq nao existe na tabela join
    return leiInsc;

  } catch (error) {
    throw new Error('Internal server error.');
  }
}

async function getArrayUsos(codUso, leiMae, numTent) {
  try {
    switch (numTent) {
      case 1:
        codUso = codUso.substring(0, 5);
        break;
      case 2:
        codUso = codUso.substring(0, 4);
        break;
      case 3:
        codUso = codUso.substring(0, 3);
        break;
      case 4:
        codUso = codUso.substring(0, 2);
        break;

      default:
        break;
    }

    const { rows: search } = await connection.raw(`
      select a.fields -> 'cd_plan_zon_uso' as cd_plan_zon_uso, a.fields -> 'lei' as lei,
      a.fields -> 'cd_secao' as cd_secao, a.fields -> 'nome' as desc_uso, a.fields -> 'codigo' as cd_classe
        from urbano.atividades a
        where regexp_replace(a.fields -> 'codigo','[^0-9]','','g') = regexp_replace('${codUso}','[^0-9]','','g')
        and a.fields -> 'lei' = '${leiMae}'
    `);

    if (!search || search.length <= 0) return false;

    return search[0];
  } catch (error) {
    throw new Error('Internal server error.');
  }
}

async function getParecer(inscricaoImobiliaria, inscricaoTerritorial, uso, solicita) {
  var array_ret = [];
  var cont_tmp = 0;

  // var array_val = await getZonValida(inscricaoImobiliaria);

  try {
    const { rows: search } = await connection.raw(`
    SELECT z.fields -> 'descricao' as nm_zon,
      z.fields -> 'nome' as tp_zon,
      (st_area(st_intersection((SELECT L.geoinformation from urbano.territoriais L where replace(L.inscricao,'.','')='${inscricaoTerritorial}'),
      z.geoinformation))/st_area((SELECT L.geoinformation from urbano.territoriais L where replace(L.inscricao,'.','')='${inscricaoTerritorial}'))) * 100 as porcentagem,
      regexp_replace(z.fields -> 'nome','[^a-zA-Z]','','g') as letras,
      z.fields -> 'lei' as lei,
      z.fields -> 'lei_2' as lei_2
    From urbano.zonas z
    where ST_Intersects(z.geoinformation, (SELECT L.geoinformation
        from urbano.territoriais L
        where replace(L.inscricao,'.','')='${inscricaoTerritorial}'))
    `);

    if (search.length > 0) {
      for(row of search) {
        var ret = '';
        var ret_uso = '';
        var campo = `uso_${row.letras.toLocaleLowerCase()}`;
        var tp_zo = row.tp_zon;
        var porcentagem = row.porcentagem;

        console.log(campo, tp_zo, uso);
        
        //split no campo $campo para pegar as tres primeiras letras do zoneamento
        var ini = campo.split('_');
        var iniciais = ini[1].toUpperCase();
        var num = search.length;

        if (num === 1) { //SE O LOTE FOR SÓ DE UM TIPO DE ZONEAMENTO
          if (row.letras === '') {
            
          } else {

            const { rows: row1 } = await connection.raw(`
              SELECT DISTINCT		
                viabilidade.plan_zon_uso.${campo},
                public.plan_zon_pd_pri_pdp.tp_zon,
                public.plan_zon_pd_pri_pdp.lei_2,
                '${uso}' as uso,
                (select desc_uso from viabilidade.plan_zon_uso where cd_classe='${uso}') as desc_uso,
                viabilidade.plan_zon_areas.nm_zon,
                public.plan_zon_pd_pri_pdp.lei
              FROM 
                ((((ctu.cotr_imobiliario LEFT JOIN public.cad_lote
                ON ctu.cotr_imobiliario.cd_lote = public.cad_lote.cd_lote) 
                LEFT JOIN public.plan_zon_pd_pri_pdp_join
                ON public.cad_lote.mslink = public.plan_zon_pd_pri_pdp_join.cd_mslink_lote)
                LEFT JOIN public.plan_zon_pd_pri_pdp 
                ON public.plan_zon_pd_pri_pdp_join.cd_mslink_zon = public.plan_zon_pd_pri_pdp.mslink)
                LEFT JOIN viabilidade.plan_zon_uso
                ON  public.plan_zon_pd_pri_pdp.lei_2=viabilidade.plan_zon_uso.lei)  
                LEFT JOIN viabilidade.plan_zon_areas
                ON (public.plan_zon_pd_pri_pdp.lei=viabilidade.plan_zon_areas.lei
                AND public.plan_zon_pd_pri_pdp.tp_zon=viabilidade.plan_zon_areas.tp_zon)
              WHERE 
                ctu.cotr_imobiliario.nu_insc_imbl='${inscricaoImobiliaria}'
                AND viabilidade.plan_zon_uso.cd_classe='${uso}'
                AND public.plan_zon_pd_pri_pdp.tp_zon='${tp_zo}'
            `);


            // Select U.fields -> 'AMC' as uso_amc,
            //       Z.fields -> 'nome',
            //       Z.fields -> 'lei_2',
            //       '45.11-1' as uso,
            //       U.fields -> 'nome' as desc_uso,
            //       Z.fields -> 'descricao',
            //       Z.fields -> 'lei'
            //   from urbano.zonas Z
            //       left join urbano.territoriais T
            //         on ST_Intersects(T.geoinformation, Z.geoinformation)
            //       left join urbano.usos U
            //         on U.fields -> 'lei' = Z.fields -> 'lei_2'
            // where replace(T.inscricao,'.','')='52480860171'
            //   and U.fields -> 'cd_classe' = '45.11-1'
            //   and Z.fields -> 'nome' = 'AMC 6.5'
    
            //1º split retorna a letra do tipo de adequacao na primeira parte do split, ou seja, 
            //no $parecer_array[0](ex: A) e as demais parte(s) ($parecer_array[1],etc...) as limitacoes e usos (ex: 10-p)
            var parecer_array = row1[0][campo].split('-');				
            var parecer_texto = parecer_array[0];

            const { rows: row2 } = await connection.raw(`
              SELECT viabilidade.plan_zon_adeq.desc_adeq
              FROM viabilidade.plan_zon_adeq
              WHERE viabilidade.plan_zon_adeq.tp_adeq='${parecer_texto}'
            `);
            
            //retorna a adequecao das areas (ex: Tolerável)	
            var adequacao = row2[0].desc_adeq;
            
            var limitacao = parecer_array;
            var complemento_adeq = '';
            var nums = '';

            for (let i = 0; i < limitacao.length; i++) {  //percorre o array de retorno do 2º split
              
              if (i !== 0) { //ignora a posicao 0 pois é o parecer
                if (i > 1) {
                  complemento_adeq += `/${limitacao[i]}`;
                } else {
                  complemento_adeq += limitacao[i];
                }
                if (limitacao[i] !== '') { //se o array nao for vazio busca limitacoes e/ou usos
                  var aux = limitacao[i];
                  
                  if (!isNaN(aux) || (aux === '*')) { //se é nro => consulta na tabela plan_zon_adeq_le
                    if (nums === '') {
                        nums += aux;
                    } else {
                        nums += `,${aux}`;
                    }
                    const { rows: search3 } = await connection.raw(`
                      SELECT viabilidade.plan_zon_adeq_le.desc_le, viabilidade.plan_zon_adeq_le.tp_le
                      FROM viabilidade.plan_zon_adeq_le
                      WHERE viabilidade.plan_zon_adeq_le.tp_le='${aux}'AND lei='${row1[0].lei_2}'
                    `);
                          
                    var row4 = search3[0];

                    if (ret !== '') {
                      ret += `. ${row4.tp_le} - ${row4.desc_le}`; 
                    } else {
                      ret += `${row4.tp_le} - ${row4.desc_le}`;
                    }

                  } else { //senao é nro=> consulta na tabela plan_zon_adequacao_uso
                    const { rows: search4 } = await connection.raw(`
                      SELECT viabilidade.plan_zon_adequacao_uso.desc_adeq_uso,
                      viabilidade.plan_zon_adequacao_uso.tp_adeq_uso
                      FROM viabilidade.plan_zon_adequacao_uso
                      WHERE viabilidade.plan_zon_adequacao_uso.tp_adeq_uso='${aux}'
                    `);

                    var row5 = search4[0];
                    ret_uso += row5.desc_adeq_uso;
                  }
                }
              }
            }

            var tu = '';
            if (ret_uso !== ''){
              tu = row5.tp_adeq_uso;
            }

            array_ret[cont_tmp] = {
              parecer: adequacao,
              porcentagem,
              limitacao: ret,
              uso: ret_uso,
              tp_uso: tu,
              nm_zon: row1[0].tp_zon,
              zon: row1[0].nm_zon,
              comp_adeq_uso: complemento_adeq,
              lei_2: row1[0].lei_2,
              lei: row1[0].lei,
              letra_parecer: parecer_texto,
              numeros_parecer: nums,
              cd_sv: array_val[0].cd_sv,
              marcacao: '1',
              status: '1',
            };
            cont_tmp++;
          }
          
        } else { //SE O LOTE FOR DE MAIS DE UM TIPO DE ZONEAMENTO FAZ OS CÁLCULOS PARA O PARECER FINAL	
          //split no campo $campo para pegar as tres primeiras letras do zoneamento
          var ini = campo.split('_');
          var iniciais = ini[1].toUpperCase();

          // console.log(campo, uso, inscricaoImobiliaria, solicita, tp_zo);

          //retorna os usos de adequação da tabela plan_zon_uso  (ex: A-10-p)
          const { rows: search5 } = await connection.raw(`
            SELECT DISTINCT --a unica alteração foi colocar o distinct 			
              viabilidade.plan_zon_uso.${campo},
              public.plan_zon_pd_pri_pdp.tp_zon,
              public.plan_zon_pd_pri_pdp.lei_2,
              '${uso}' as uso,
              (select desc_uso from viabilidade.plan_zon_uso where cd_classe='${uso}') as desc_uso,
              viabilidade.plan_zon_areas.nm_zon,
              public.plan_zon_pd_pri_pdp.lei
            FROM 
              ((((ctu.cotr_imobiliario LEFT JOIN public.cad_lote
              ON ctu.cotr_imobiliario.cd_lote = public.cad_lote.cd_lote) 
              LEFT JOIN public.plan_zon_pd_pri_pdp_join
              ON public.cad_lote.mslink = public.plan_zon_pd_pri_pdp_join.cd_mslink_lote)
              LEFT JOIN public.plan_zon_pd_pri_pdp 
              ON public.plan_zon_pd_pri_pdp_join.cd_mslink_zon = public.plan_zon_pd_pri_pdp.mslink)
              LEFT JOIN viabilidade.plan_zon_uso
              ON  public.plan_zon_pd_pri_pdp.lei_2=viabilidade.plan_zon_uso.lei)  
              LEFT JOIN viabilidade.plan_zon_areas
              ON (public.plan_zon_pd_pri_pdp.lei=viabilidade.plan_zon_areas.lei
              AND public.plan_zon_pd_pri_pdp.tp_zon=viabilidade.plan_zon_areas.tp_zon)
            WHERE 
              ctu.cotr_imobiliario.nu_insc_imbl='${inscricaoImobiliaria}'
              AND viabilidade.plan_zon_uso.cd_classe='${uso}'
              AND public.plan_zon_pd_pri_pdp.tp_zon='${tp_zo}'
          `);

          var compara = '';
          if (array_val[0].status === '1') {//é pq é para marcar algum
            compara = array_val[0].tp_zon;
          } //senao volta todos, ou seja, nao marca nada
          
          for (row11 of search5) {
            var ret = '';
            var ret_uso = '';
            
            if (row11[campo] === '0' || row11[campo] === '' || row11[campo] === null) {
              array_ret[cont_tmp] = {
                parecer: 'Proibido o que requer quanto o Zoneamento',
                porcentagem,
                limitacao: '',
                uso: 'Proibido o que requer quanto o Zoneamento',
                tp_uso: '',
                nm_zon: row11.tp_zon,
                zon: row11.nm_zon,
                comp_adeq_uso: '',
                lei_2: row11.lei_2,
                lei: row11.lei,
                letra_parecer: 'P',
                numeros_parecer: '',
                cd_sv: array_val[0].cd_sv,
                marcacao: '',
                status: '1',
              };
              cont_tmp++;
            } else {
                //1º split retorna a letra do tipo de adequacao na primeira parte do split, ou seja, 
                //no $parecer_array[0](ex: A) e as demais parte(s) ($parecer_array[1],etc...) as limitacoes e usos (ex: 10-p)
                var parecer_array = row11[campo].split('-');		
                var parecer_texto = parecer_array[0];

                const { rows: search6 } = await connection.raw(`
                  SELECT viabilidade.plan_zon_adeq.desc_adeq
                  FROM viabilidade.plan_zon_adeq
                  WHERE viabilidade.plan_zon_adeq.tp_adeq='${parecer_texto}'
                `);

                var row_ = search6[0];
                var adequacao = row_.desc_adeq;
                
                var limitacao = parecer_array;
                var complemento_adeq = '';
                var nums = '';

                for (let i = 0; i < limitacao.length; i++) {  //percorre o array de retorno do 2º split
                  if (i !== 0){ //ignora a posicao 0 pois é o parecer
                    if (i > 1) {
                      complemento_adeq += `/${limitacao[i]}`;
                    } else {
                      complemento_adeq += limitacao[i];
                    }
                    if (limitacao[i] !== '') { //se o array nao for vazio busca limitacoes e/ou usos
                      var aux = limitacao[i];
                    
                      if (!isNaN(aux) || (aux === '*')) { //se é nro => consulta na tabela plan_zon_adeq_le

                        if (nums === '') {
                          nums += aux;
                        } else {
                          nums += `,${aux}`;
                        }

                        const { rows: sql_busca4 } = await connection.raw(`
                          SELECT viabilidade.plan_zon_adeq_le.desc_le, viabilidade.plan_zon_adeq_le.tp_le
                          FROM viabilidade.plan_zon_adeq_le
                          WHERE viabilidade.plan_zon_adeq_le.tp_le='${aux}'AND lei='${row11.lei_2}'
                        `);
                              
                        var row4 = sql_busca4[0];

                        if (ret !== '') {
                          ret += `. ${row4.tp_le} - ${row4.desc_le}`; 
                        } else {
                          ret += `${row4.tp_le} - ${row4.desc_le}`;
                        }
                      } else { //senao é nro=> consulta na tabela plan_zon_adequacao_uso
                        const { rows: search4 } = await connection.raw(`
                          SELECT viabilidade.plan_zon_adequacao_uso.desc_adeq_uso,
                          viabilidade.plan_zon_adequacao_uso.tp_adeq_uso
                          FROM viabilidade.plan_zon_adequacao_uso
                          WHERE viabilidade.plan_zon_adequacao_uso.tp_adeq_uso='${aux}'
                        `);

                        var row5 = search4[0];
                        ret_uso += row5.desc_adeq_uso;
                      }
                    }
                  }
                }

                var tu = '';
                if (ret_uso !== ''){
                  tu = row5.tp_adeq_uso;
                }

                array_ret[cont_tmp] = {
                  parecer: adequacao,
                  porcentagem,
                  limitacao: ret,
                  uso: ret_uso,
                  tp_uso: tu,
                  nm_zon: row11.tp_zon,
                  zon: row11.nm_zon,
                  comp_adeq_uso: complemento_adeq,
                  lei_2: row11.lei_2,
                  lei: row11.lei,
                  letra_parecer: parecer_texto,
                  numeros_parecer: nums,
                  cd_sv: '',
                  marcacao: '',
                  status: array_val[0].status,
                };
                cont_tmp++;
              
            }
            
          } //fim do while( $row1 = $bd2->getNextRow()
        }
      } 
      
    }

  } catch (error) {
    // console.log(error)
    return array_ret;
  }
  return array_ret;
}