const connection = require('../database/connection');

module.exports = {
  async index(req, res) {
    try {
      const { inscricaoImobiliaria, cnaes } = req.body;

      if (!inscricaoImobiliaria || inscricaoImobiliaria === '' || !cnaes) {
        return res.status(400).json({ erro: 'Inscrição inválida!' });
      }

      let inscricaoFormated = inscricaoImobiliaria.replace(/([^0-9])/g, '');

      if (inscricaoFormated.length !== 17) {
        return res.status(400).json({ erro: 'Inscrição inválida!' });
      }

      inscricaoFormated = inscricaoFormated.substring(0, 14);

      const inscricaoTerritorial = await validaInscrica(inscricaoFormated);
      
      if (inscricaoTerritorial === '') {
        return res.status(400).json({ erro: 'Inscrição inválida!' });
      }

      const inscricaoTerritorialFormated = inscricaoTerritorial.replace(/([^0-9])/g, '');

      const leiMae = await getLeiMae(inscricaoTerritorialFormated);

      if (leiMae === '') {
        return res.status(400).json({ erro: 'Inscrição não Geocodificada!' });
      }

      const fl_response = await getEdificada(inscricaoTerritorialFormated);

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

        const array_parecer = await getParecer(inscricaoImobiliaria.replace(/([^0-9])/g, ''), inscricaoTerritorialFormated, response.cd_classe);

        if (array_parecer.length > 0) {
          for (let i = 0; i < array_parecer.length; i++) {
            var parecer = '';

            //CONCATENANDO PARECER COM LIMITACOES DE USO
            if (parecer === '') { //CASO NAO TENHA CAIDO EM NENHUM CASO ESPECIAL(excecao)
              parecer = array_parecer[i]['parecer'] + '. ';
              if (array_parecer[i]['comp_adeq_uso'] !== '') {
                parecer += array_parecer[i]['comp_adeq_uso'] + ' = ';
              }
              if (array_parecer[i]['limitacao']!== '') {
                parecer += array_parecer[i]['limitacao'];
              }
              if (array_parecer[i]['tp_uso'] !== '') {
                if (parecer !== '') {
                  parecer += ' ' + array_parecer[i]['tp_uso'] + ' = ' + array_parecer[i]['uso'] + '.';
                } else {
                  parecer += array_parecer[i]['tp_uso'] + ' = ' + array_parecer[i]['uso'] + '.';
                }
              }
            }

            cnaesResult.push({
              cnae: cnaeCod,
              // status: array_parecer[i].status,
              lei: array_parecer[i].lei_2,
              lei_alteracao: array_parecer[i].lei,
              nm_zon: array_parecer[i].nm_zon,
              de_zon: array_parecer[i].zon,
              parecer,
              porcentagem: array_parecer[i].porcentagem,
              viavel: (array_parecer[i].letra_parecer === 'A'),
            });
          }
        } else {
          cnaesResult.push({
            cnae: cnaeCod,
            viavel: false,
          })
        }
      }

      return res.json({ 
        inscricaoImobiliaria: inscricaoImobiliaria,
        fl_edificada: fl_response.fl_edificada,
        fl_edificada_desc : fl_response.fl_edificada_desc,
        cnaes: cnaesResult,
      });

      return res.json({
        inscricaoFormated
      });

    } catch (err){
      return res.status(500).json({ erro: 'Internal server error.' });
    }
  },
};

async function getEdificada(inscricaoTerritorial) {
  try {
    var response = {};

    const inscricaoImobiliariaFormated = `${inscricaoTerritorial.slice(0, 2)}.${inscricaoTerritorial.slice(2, 4)}.${inscricaoTerritorial.slice(4, 7)}.${inscricaoTerritorial.slice(7, 11)}`;

    const { rows } = await connection.raw(`
      select a.description as descricao
      From geowise."types" a, urbano.territoriais t
      where t.fields -> 'tipo_ocupacao_id' = a.id::varchar
      and t.inscricao = '${inscricaoImobiliariaFormated}'
    `);

    if (rows && rows.length > 0) {
      response.fl_edificada = rows[0].descricao === 'Construído' ? 'S' : 'N';
      response.fl_edificada_desc = rows[0].descricao;
    } else {
      response.fl_edificada = 'Não encontrada';
      response.fl_edificada_desc = 'Não encontrada';
    }

    return response;
  } catch (error) {
    throw new Error('Internal server error.');
  }
}

async function validaInscrica(inscricaoImobiliaria) {
  try {


    const inscricaoImobiliariaFormated = `${inscricaoImobiliaria.slice(0, 2)}.${inscricaoImobiliaria.slice(2, 4)}.${inscricaoImobiliaria.slice(4, 7)}.${inscricaoImobiliaria.slice(7, 11)}.${inscricaoImobiliaria.slice(11, 14)}`;

    const { rows } = await connection.raw(`
      SELECT territorial_id, ativo FROM urbano.autonomas
      WHERE urbano.autonomas.inscricao = '${inscricaoImobiliariaFormated}';
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

async function getLeiMae(inscricaoTerritorial) {
  try {

    const inscricaoImobiliariaFormated = `${inscricaoTerritorial.slice(0, 2)}.${inscricaoTerritorial.slice(2, 4)}.${inscricaoTerritorial.slice(4, 7)}.${inscricaoTerritorial.slice(7, 11)}`;

    const { rows: search } = await connection.raw(`
      select z.fields -> 'lei_2' as lei_2
      From urbano.zonas z, urbano.territoriais t
      where ST_Intersects(z.geoinformation, t.geoinformation)
      and t.inscricao = '${inscricaoImobiliariaFormated}'
    `);

    let leiInsc = '';

    if (search && search.length > 0) leiInsc = search[0].lei_2;

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

    codUso = codUso.replace(/([^0-9])/g, '');

    const { rows: search } = await connection.raw(`
      select a.fields -> 'codigo' as cd_classe
        from urbano.atividades a
        where regexp_replace(a.fields -> 'codigo','[^0-9]','','g') = '${codUso}'
        and a.fields -> 'lei' = '${leiMae}'
    `);

    
    if (!search || search.length <= 0) return false;

    return search[0];
  } catch (error) {
    throw new Error('Internal server error.');
  }
}

var array_val = null;

async function getParecer(inscricaoImobiliaria, inscricaoTerritorial, uso) {
  var array_ret = [];
  var cont_tmp = 0;

  if (!array_val) {
    array_val = await getZonValida(inscricaoImobiliaria);
  }

  const inscricaoTerritorialFormated = `${inscricaoTerritorial.slice(0, 2)}.${inscricaoTerritorial.slice(2, 4)}.${inscricaoTerritorial.slice(4, 7)}.${inscricaoTerritorial.slice(7, 11)}`;

  try {
    const { rows: search } = await connection.raw(`
    with territorial as (
      select inscricao, geoinformation
        from urbano.territoriais t
      )     
      SELECT z.fields -> 'descricao' as nm_zon,
          z.fields -> 'nome' as tp_zon,
          (st_area(st_intersection((SELECT L.geoinformation from territorial L where L.inscricao ='${inscricaoTerritorialFormated}'),
          z.geoinformation))/st_area((SELECT L.geoinformation from territorial L where L.inscricao ='${inscricaoTerritorialFormated}'))) * 100 as porcentagem,
          z.fields -> 'nome' as letras,
          z.fields -> 'lei' as lei,
          z.fields -> 'lei_2' as lei_2
        From urbano.zonas z
        where ST_Intersects(z.geoinformation, (SELECT L.geoinformation
            from territorial L
            where L.inscricao ='${inscricaoTerritorialFormated}'))
    `);

    if (search.length > 0) {
      for(row of search) {

        const letras = row.letras.replace(/[^a-zA-Z]/g, '');

        var ret = '';
        var ret_uso = '';
        var campo = `uso_${letras.toLocaleLowerCase()}`;
        var tp_zo = row.tp_zon;
        var porcentagem = row.porcentagem;
        
        //split no campo $campo para pegar as tres primeiras letras do zoneamento
        var ini = campo.split('_');
        var iniciais = ini[1].toUpperCase();
        var num = search.length;

        if (num === 1) { //SE O LOTE FOR SÓ DE UM TIPO DE ZONEAMENTO
          if (letras === '') {
            
          } else {

            const { rows: row1 } = await connection.raw(`
            Select U.fields -> '${iniciais}' as ${campo},
                Z.fields -> 'nome' as tp_zon,
                Z.fields -> 'lei_2' as lei_2,
                '${uso}' as uso,
                U.fields -> 'nome' as desc_uso,
                Z.fields -> 'descricao' as nm_zon,
                Z.fields -> 'lei' as lei
            from urbano.zonas Z
                left join urbano.territoriais T
                  on ST_Intersects(T.geoinformation, Z.geoinformation)
                left join urbano.usos U
                  on U.fields -> 'lei' = Z.fields -> 'lei_2'
            where T.inscricao ='${inscricaoTerritorialFormated}'
              and U.fields -> 'cd_classe' = '${uso}'
              and Z.fields -> 'nome' = '${tp_zo}'
            `);
    
            //1º split retorna a letra do tipo de adequacao na primeira parte do split, ou seja, 
            //no $parecer_array[0](ex: A) e as demais parte(s) ($parecer_array[1],etc...) as limitacoes e usos (ex: 10-p)
            var parecer_array = row1[0][campo].split('-');				
            var parecer_texto = parecer_array[0];
            if (parecer_array.length > 1) parecer_texto += '-'

            const { rows: row2 } = await connection.raw(`
              select t.description as desc_adeq
              from geowise."types" t 
              where t."type" = 'Urbano::TipoAdequacao' and t.integration_code = '${parecer_texto}'
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
                      select t.description as desc_le, t.integration_code as tp_le
                      from geowise."types" t 
                      where t."type" = 'Urbano::TipoAdequacaoLE' and t.integration_code = '${aux}'
                    `);
                          
                    var row4 = search3[0];

                    if (ret !== '') {
                      ret += `. ${row4.tp_le} - ${row4.desc_le}`; 
                    } else {
                      ret += `${row4.tp_le} - ${row4.desc_le}`;
                    }

                  } else { //senao é nro=> consulta na tabela plan_zon_adequacao_uso
                    const { rows: search4 } = await connection.raw(`
                      select t.description as desc_adeq_uso, t.integration_code as tp_adeq_uso
                      from geowise."types" t 
                      where t."type" = 'Urbano::TipoAdequacaoUso' and t.integration_code = '${aux.toUpperCase()}'
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

          //retorna os usos de adequação da tabela plan_zon_uso  (ex: A-10-p)
          const { rows: search5 } = await connection.raw(`
          Select U.fields -> '${iniciais}' as ${campo},
              Z.fields -> 'nome' as tp_zon,
              Z.fields -> 'lei_2' as lei_2,
              '${uso}' as uso,
              U.fields -> 'nome' as desc_uso,
              Z.fields -> 'descricao' as nm_zon,
              Z.fields -> 'lei' as lei
          from urbano.zonas Z
              left join urbano.territoriais T
                on ST_Intersects(T.geoinformation, Z.geoinformation)
              left join urbano.usos U
                on U.fields -> 'lei' = Z.fields -> 'lei_2'
          where T.inscricao ='${inscricaoTerritorialFormated}'
            and U.fields -> 'cd_classe' = '${uso}'
            and Z.fields -> 'nome' = '${tp_zo}'
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
                if (parecer_array.length > 1) parecer_texto += '-'

                const { rows: search6 } = await connection.raw(`
                  select t.description as desc_adeq
                  from geowise."types" t 
                  where t."type" = 'Urbano::TipoAdequacao' and t.integration_code = '${parecer_texto}'
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
                          select t.description as desc_le, t.integration_code as tp_le
                          from geowise."types" t 
                          where t."type" = 'Urbano::TipoAdequacaoLE' and t.integration_code = '${aux}'
                        `);
                              
                        var row4 = sql_busca4[0];

                        if (ret !== '') {
                          ret += `. ${row4.tp_le} - ${row4.desc_le}`; 
                        } else {
                          ret += `${row4.tp_le} - ${row4.desc_le}`;
                        }
                      } else { //senao é nro=> consulta na tabela plan_zon_adequacao_uso
                        const { rows: search4 } = await connection.raw(`
                          select t.description as desc_adeq_uso, t.integration_code as tp_adeq_uso
                          from geowise."types" t 
                          where t."type" = 'Urbano::TipoAdequacaoUso' and t.integration_code = '${aux.toUpperCase()}'
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
    return array_ret;
  }
  return array_ret;
}

async function getZonValida(inscricaoImobiliaria) {
  var array_sv = [];
  var array_sv_aux = [];
  let count_aux = 0;

  const inscricaoImobiliariaFormated = `${inscricaoImobiliaria.slice(0, 2)}.${inscricaoImobiliaria.slice(2, 4)}.${inscricaoImobiliaria.slice(4, 7)}.${inscricaoImobiliaria.slice(7, 11)}.${inscricaoImobiliaria.slice(11, 14)}`;

  try {
    const { rows: search } = await connection.raw(`
      select distinct on (e.cd_logr,e.tp_zon)
          e.cd_logr,
          e.tp_zon,
          e.lei,
          e.lei_2,
          case 
              when st_intersects(f.geoinformation ,e.intersecao)  then 'true'
              when st_distance(f.geoinformation ,e.intersecao)<=5 then 'true'
              when st_touches(f.geoinformation ,e.intersecao)     then 'true'
              else 'false'
          end as resposta,
          f.fields -> 'nome' as cd_sv
      from (select c.cd_logr,
                  c.geom_centerline,
                  c.geom_lote,
                  c.cd_lote,
                  d.fields -> 'nome' as tp_zon,
                  d.fields -> 'descricao' as nm_zon,
                  d.fields -> 'lei' as lei,
                  d.fields -> 'lei_2' as lei_2,
                  d.geoinformation as geom_zon,
                  st_distance(st_Intersection(c.geom_lote, d.geoinformation), c.geom_centerline) as distancia,
                  st_area(st_Intersection(c.geom_lote, d.geoinformation)) as area,
                  st_intersection(c.geom_lote, d.geoinformation) as intersecao
            from (select distinct
                          t3.logradouro_id as cd_logr,
                          substring(a.inscricao, 1, 14) as cd_lote,
                          t3.geoinformation as geom_centerline,
                          t.geoinformation  as geom_lote,
                          st_area(ST_Intersection(t.geoinformation, t3.geoinformation)) as area_inter_lote_centerline,
                          st_astext(st_centroid(t3.geoinformation)),
                          st_distance(t3.geoinformation, t.geoinformation) as dist
                    from urbano.avaliacoes a
                          inner join urbano.autonomas a2
                            on a2.id = a.autonoma_id
                          inner join urbano.territoriais t
                            on t.id = a2.territorial_id
                          inner join urbano.propriedades p
                            on p.autonoma_id = a2.id
                          inner join urbano.testadas t2
                            on t2.territorial_id = t.id
                          inner join urbano.trechos t3
                            on (t3.logradouro_id::varchar  = t2.fields -> 'logradouro_id'
                                or t3.logradouro_id::varchar = t2.fields -> 'logradouro_id2'
                                or t3.logradouro_id::varchar = t2.fields -> 'logradouro_id3'
                                or t3.logradouro_id::varchar = t2.fields -> 'logradouro_id4')
                    where st_isvalid(t.geoinformation) = true
                      and st_isvalid(t3.geoinformation) = true
                      and st_distance(t.geoinformation, t3.geoinformation) < 30
                      and a.inscricao = '${inscricaoImobiliariaFormated}'
                  ) as c, urbano.zonas d
            where st_isvalid(c.geom_lote)      = true
              and st_isvalid(d.geoinformation) = true
              and st_intersects(c.geom_lote, d.geoinformation)
              and c.geom_lote && d.geoinformation
              and st_area(st_Intersection(c.geom_lote, d.geoinformation)) >10
            order by distancia
          ) as  e, urbano.vias f
      where
        --st_intersects(st_line_interpolate_point(e.geom_centerline,0.50), f.geoinformation) and
      (st_intersects(e.geom_lote, f.geoinformation) or st_touches(e.geom_lote,f.geoinformation))
      and case
              when st_intersects(f.geoinformation ,e.intersecao)  then 'true'
              when st_distance(f.geoinformation ,e.intersecao)<=5 then 'true'
              when st_touches(f.geoinformation ,e.intersecao)     then 'true'
          else 'false'
          end = 'true'
      order by cd_logr;
    `);

    if (search.length > 0) {

      for(value of search) {
        array_sv_aux[count_aux] = {
          tp_zon: value.tp_zon.replace(' ', '').trim(),
          lei: value.lei,
          lei_2: value.lei_2,
          cd_logr: value.cd_logr,
          prioridade: value.prioridade,
          cd_sv: value.cd_sv,
        };
        count_aux++;
      }
      
			if (array_sv_aux.length !== 0) {//SE EXITIR RETORNO
			
        if (array_sv_aux.length > 1) {//SE FOR MAIS DO QUE UM RETORNO ANALISAR
					if (array_sv_aux[0].prioridade === array_sv_aux[1].prioridade) {//SE EXISTIR MAIS DE UM COM A MESMA PRIORIDADE
						//funcao que verifica se tem mais de um logr. 
						//Paassando por parametro o prioridade para poder ignorar o resto dos que estao no array
						var varios_logrs = verificaLogr(array_sv_aux, array_sv_aux[0].prioridade);
						
						if (varios_logrs) {//verificar qual esta no STM e tratar
							array_sv = verificaLogrStm(inscricaoImobiliaria);			
						} else {
              //voltar todos eles
              array_sv[0] = { status: '2' };
						}
          } else {//SENAO VOLTA O DE MAIOR PRIORIDADE
            array_sv[0] = {
              status: '1',
              tp_zon: array_sv_aux[0].tp_zon,
              lei: array_sv_aux[0].lei,
              lei_2: array_sv_aux[0].lei_2,
              cd_sv: array_sv_aux[0].cd_sv,
            };
					}			
        } else {//SENAO JÁ VOLTA ESSE RESULTADO
          array_sv[0] = { 
            status: '1',
            tp_zon: array_sv_aux[0].tp_zon,
            lei: search[0].lei,
            lei_2: search[0].lei_2,
            cd_sv: array_sv_aux[0].cd_sv,
          };
				}
			}else{
				//se remeter ao estudo
				array_sv[0] = { status: '2' };
			}		
		}else{
			//se remeter a estudo
			array_sv[0] = { status: '2' };
		}

    return array_sv;
  } catch (error) {
    console.log(error);
  }
}

function verificaLogr(array_sv_aux, prioridade){
  let varios_logrs = false;
  let logr = '';

  for (let i = 0; i < array_sv_aux.length; i++) {
    if(array_sv_aux[i].prioridade == prioridade){				
      if ((logr != '') && (logr != array_sv_aux[i].cd_logr)) {
        varios_logrs = true;
      } else {
        varios_logrs = false;
      }			
      logr = array_sv_aux[i].cd_logr;
    }
  }

  return varios_logrs;
}


async function verificaLogrStm(inscricao){
  var array_ret = [];


  const inscricaoImobiliariaFormated = `${inscricao.slice(0, 2)}.${inscricao.slice(2, 4)}.${inscricao.slice(4, 7)}.${inscricao.slice(7, 11)}.${inscricao.slice(11, 14)}`;

  const { rows: search } = await connection.raw(`
        select distinct on (e.cd_logr,e.tp_zon)
        e.cd_logr,
        e.tp_zon,
        e.lei,
        e.lei_2,
        case 
            when st_intersects(f.geoinformation ,e.intersecao)  then 'true'
            when st_distance(f.geoinformation ,e.intersecao)<=5 then 'true'
            when st_touches(f.geoinformation ,e.intersecao)     then 'true'
            else 'false'
        end as resposta,
        f.fields -> 'nome' as cd_sv
      from (select c.cd_logr,
                c.geom_centerline,
                c.geom_lote,
                c.cd_lote,
                d.fields -> 'nome' as tp_zon,
                d.fields -> 'descricao' as nm_zon,
                d.fields -> 'lei' as lei,
                d.fields -> 'lei_2' as lei_2,
                d.geoinformation as geom_zon,
                st_distance(st_Intersection(c.geom_lote, d.geoinformation), c.geom_centerline) as distancia,
                st_area(st_Intersection(c.geom_lote, d.geoinformation)) as area,
                st_intersection(c.geom_lote, d.geoinformation) as intersecao
          from (select distinct
                        t3.logradouro_id as cd_logr,
                        substring(a.inscricao, 1, 14) as cd_lote,
                        t3.geoinformation as geom_centerline,
                        t.geoinformation  as geom_lote,
                        st_area(ST_Intersection(t.geoinformation, t3.geoinformation)) as area_inter_lote_centerline,
                        st_astext(st_centroid(t3.geoinformation)),
                        st_distance(t3.geoinformation, t.geoinformation) as dist
                  from urbano.avaliacoes a
                        inner join urbano.autonomas a2
                          on a2.id = a.autonoma_id
                        inner join urbano.territoriais t
                          on t.id = a2.territorial_id
                        inner join urbano.propriedades p
                          on p.autonoma_id = a2.id
                        inner join urbano.testadas t2
                          on t2.territorial_id = t.id
                        inner join urbano.trechos t3
                          on (t3.logradouro_id::varchar  = t2.fields -> 'logradouro_id'
                              or t3.logradouro_id::varchar = t2.fields -> 'logradouro_id2'
                              or t3.logradouro_id::varchar = t2.fields -> 'logradouro_id3'
                              or t3.logradouro_id::varchar = t2.fields -> 'logradouro_id4')
                  where st_isvalid(t.geoinformation) = true
                    and st_isvalid(t3.geoinformation) = true
                    and st_distance(t.geoinformation, t3.geoinformation) < 30
                    and a.inscricao = '${inscricaoImobiliariaFormated}'
                ) as c, urbano.zonas d
          where st_isvalid(c.geom_lote)      = true
            and st_isvalid(d.geoinformation) = true
            and st_intersects(c.geom_lote, d.geoinformation)
            and c.geom_lote && d.geoinformation
            and st_area(st_Intersection(c.geom_lote, d.geoinformation)) >10
          order by distancia
        ) as  e, urbano.vias f
      where
      --st_intersects(st_line_interpolate_point(e.geom_centerline,0.50), f.geoinformation) and
      (st_intersects(e.geom_lote, f.geoinformation) or st_touches(e.geom_lote,f.geoinformation))
      and  case
              when st_intersects(f.geoinformation ,e.intersecao)  then 'true'
              when st_distance(f.geoinformation ,e.intersecao)<=5 then 'true'
              when st_touches(f.geoinformation ,e.intersecao)     then 'true'
          else 'false'
        end = 'true'
      order by cd_logr;
  `);
  
  if ( search.length > 0) {
    for(value of search) {
      if (search.length > 1) {
        array_ret[0] = { status: '2' };
      } else {
        array_ret[0] = { 
          status: '1',
          tp_zon: value.tp_zon.replace(' ', '').trim(),
          lei: value.lei,
          lei_2: value.lei_2,
          cd_sv: value.cd_sv,
        };
      }
    }
  } else {
    array_ret[0] = { status: '2' };
  }

  return array_ret;
}